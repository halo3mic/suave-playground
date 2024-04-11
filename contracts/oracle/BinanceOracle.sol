// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.13;

import { AnyBundleContract, Suave } from "../standard_peekers/bids.sol";
import { SuaveContract } from "../blockad/lib/SuaveContract.sol";
import "../../node_modules/solady/src/utils/JSONParserLib.sol";
import "../libraries/Transactions.sol";
import "../libraries/Bundle.sol";
import "solady/src/utils/LibString.sol";


contract BinanceOracle is SuaveContract {
    using JSONParserLib for *;

    uint public constant HOLESKY_CHAINID = 17000;
    string public constant HOLESKY_CHAINID_STR = "0x4268";
    uint8 public constant DECIMALS = 4;
    string public constant S_NAMESPACE = "oracle:v0:pksecret";
    string public constant REMOTE_HOLESKY_RPC = "https://ethereum-holesky-rpc.publicnode.com";
    string public constant URL_PARTIAL = "https://data-api.binance.vision/api/v3/ticker/price?symbol=";
    string public constant HOLESKY_BUNDLE_ENDPOINT = "https://relay-holesky.flashbots.net";
    
    bool isInitialized;
    Suave.DataId public pkBidId;
    address public controller;
    address public settlementContract;

    event PriceSubmission(string ticker, uint price);

    // ⛓️ EVM Methods

    function confidentialConstructorCallback(
        Suave.DataId _pkBidId, 
        address pkAddress
    ) public {
        crequire(!isInitialized, "Already initialized");
        pkBidId = _pkBidId;
        controller = pkAddress;
        isInitialized = true;
    }

    function registerCallback(address _settlementContract) public {
        require(settlementContract == address(0), "Already registered");
        settlementContract = _settlementContract;
    }

    // ! Warning: This method is not restricted and emitted events should not be relied upon
    function queryAndSubmitCallback(string memory ticker, uint price) public {
        emit PriceSubmission(ticker, price);
    }

    fallback() external payable {
        // Needed to accept MEVM calls with no callbacks
    }

    // 🤐 MEVM Methods

    function confidentialConstructor() external view onlyConfidential returns (bytes memory) {
        crequire(!isInitialized, "Already initialized");

        string memory pk = Suave.privateKeyGen(Suave.CryptoSignature.SECP256);
        address pkAddress = getAddressForPk(pk);
		Suave.DataId bidId = storePK(bytes(pk));

        return abi.encodeWithSelector(
            this.confidentialConstructorCallback.selector, 
            bidId, 
            pkAddress
        );
    }

    function registerSettlementContract(
        address _settlementContract
    ) external view onlyConfidential() returns (bytes memory) {
        // Allow multiple registrations for the same address (consider the intial tx is not commited to the chain)
        require(_settlementContract == settlementContract || settlementContract == address(0), "Already registered");
        bytes memory signedTx = createRegisterTx(_settlementContract);
        sendRawTx(signedTx);
        return abi.encodeWithSelector(this.registerCallback.selector, _settlementContract);
    }

    function queryAndSubmit(
        string memory ticker,
        uint nonce,
        uint gasPrice,
        uint64 settlementBlockNum,
        bool privateSubmission
    ) external view onlyConfidential returns (bytes memory) {
        uint price = queryLatestPrice(ticker);
        submitPriceUpdate(ticker, price, nonce, gasPrice, settlementBlockNum, privateSubmission);
        return abi.encodeWithSelector(this.queryAndSubmitCallback.selector, ticker, price);
    }

    function queryLatestPrice(string memory ticker) public view returns (uint price) {
        bytes memory response = doBinanceQuery(ticker);
        JSONParserLib.Item memory parsedRes = string(response).parse();
        // solhint-disable-next-line
        string memory priceStr = string(parsedRes.at('"price"').value());
        price = floatToInt(trimStrEdges(priceStr), DECIMALS);
    }

    function submitPriceUpdate(
        string memory ticker,
        uint price, 
        uint nonce,
        uint gasPrice,
        uint64 settlementBlockNum,
        bool privateSubmission
    ) internal view {
        bytes memory signedTx = createPriceUpdateTx(ticker, price, nonce, gasPrice);
        if (privateSubmission) {
            sendBundle(signedTx, settlementBlockNum);
        } else {
            sendRawTx(signedTx);
        }
    }

    function createRegisterTx(address _settlementContract) internal view returns (bytes memory txSigned) {
        Transactions.EIP155 memory transaction = Transactions.EIP155({
            nonce: 0,
            gasPrice: 100 gwei,
            gas: 100_000,
            to: _settlementContract,
            value: 0,
            data: abi.encodeWithSignature("register()"),
            chainId: HOLESKY_CHAINID,
            v: 27,
            r: hex"1111111111111111111111111111111111111111111111111111111111111111",
            s: hex"1111111111111111111111111111111111111111111111111111111111111111"
        });
        bytes memory txRlp = Transactions.encodeRLP(transaction);
        string memory pk = retreivePK();
        txSigned = Suave.signEthTransaction(txRlp, HOLESKY_CHAINID_STR, pk);
    }

    function createPriceUpdateTx(
        string memory ticker, 
        uint price, 
        uint nonce, 
        uint gasPrice
    ) internal view returns (bytes memory txSigned)  {
        Transactions.EIP155 memory transaction = Transactions.EIP155({
            nonce: nonce,
            gasPrice: gasPrice,
            gas: 100_000,
            to: settlementContract,
            value: 0,
            data: abi.encodeWithSignature("updatePrice(string,uint256)", ticker, price),
            chainId: HOLESKY_CHAINID,
            v: 27,
            r: hex"1111111111111111111111111111111111111111111111111111111111111111",
            s: hex"1111111111111111111111111111111111111111111111111111111111111111"
        });
        bytes memory txRlp = Transactions.encodeRLP(transaction);
        string memory pk = retreivePK();
        txSigned = Suave.signEthTransaction(txRlp, HOLESKY_CHAINID_STR, pk);
    }

    function sendRawTx(bytes memory txSigned) public view returns (bytes memory) {
        /* solhint-disable */
        bytes memory body = abi.encodePacked(
            '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":["', 
            LibString.toHexString(txSigned), 
            '"],"id":1}'
        );
        /* solhint-enable */
        Suave.HttpRequest memory request;
        request.method = "POST";
        request.body = body;
        request.headers = new string[](1);
        request.headers[0] = "Content-Type: application/json";
        request.withFlashbotsSignature = false;
        request.url = REMOTE_HOLESKY_RPC;
        return doHttpRequest(request);
    }

    function sendBundle(bytes memory txSigned, uint64 settlementBlockNum) internal view {
        simulateTx(txSigned);
        sendTxViaBundle(txSigned, settlementBlockNum);
    }

    function simulateTx(bytes memory signedTx) internal view {
        // solhint-disable-next-line
        bytes memory bundle = abi.encodePacked('{"txs": ["', LibString.toHexString(signedTx), '"]}');
        (bool successSim, bytes memory data) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        crequire(successSim,  string(abi.encodePacked("BundleSimulationFailed: ", string(data))));
    }

    function doBinanceQuery(string memory ticker) internal view returns (bytes memory) {
        string[] memory headers = new string[](1);
        headers[0] = "Content-Type: application/json";
        Suave.HttpRequest memory request = Suave.HttpRequest({
            url: string(abi.encodePacked(URL_PARTIAL, ticker)),
            method: "GET",
            headers: headers,
            body: new bytes(0),
            withFlashbotsSignature: false
        });
        return doHttpRequest(request);
    }

    function doHttpRequest(Suave.HttpRequest memory request) internal view returns (bytes memory) {
        (bool success, bytes memory data) = Suave.DO_HTTPREQUEST.staticcall(abi.encode(request));
        crequire(success, string(data));
        return abi.decode(data, (bytes));
    }

    function sendTxViaBundle(bytes memory txSigned, uint64 settlementBlockNum) internal view {
        bytes[] memory txns = new bytes[](1);
        txns[0] = txSigned;
        bytes memory bundleReqParams = bundleRequestParams(txns, settlementBlockNum);
        (bool successReq, bytes memory dataReq) = Suave.SUBMIT_BUNDLE_JSON_RPC.staticcall(abi.encode(
            HOLESKY_BUNDLE_ENDPOINT, 
            "eth_sendBundle", 
            bundleReqParams
        ));
        crequire(successReq, string(abi.encodePacked("BundleSubmissionFailed: ", string(dataReq))));
    }

    function bundleRequestParams(bytes[] memory txns, uint blockNumber) internal pure returns (bytes memory) {
        // solhint-disable-next-line
        bytes memory params = abi.encodePacked('{"blockNumber": "', LibString.toHexString(blockNumber), '", "txs": [');
        for (uint256 i = 0; i < txns.length; i++) {
            // solhint-disable-next-line
            params = abi.encodePacked(params, '"', LibString.toHexString(txns[i]), '"');
            if (i < txns.length - 1) {
                params = abi.encodePacked(params, ",");
            } else {
                params = abi.encodePacked(params, "]");
            }
        }
        params = abi.encodePacked(params, "}");

        return params;
    }

    function storePK(bytes memory pk) internal view returns (Suave.DataId) {
		address[] memory peekers = new address[](3);
		peekers[0] = address(this);
		peekers[1] = Suave.FETCH_DATA_RECORDS;
		peekers[2] = Suave.CONFIDENTIAL_RETRIEVE;
		Suave.DataRecord memory secretBid = Suave.newDataRecord(0, peekers, peekers, S_NAMESPACE);
		Suave.confidentialStore(secretBid.id, S_NAMESPACE, pk);
		return secretBid.id;
	}

    function retreivePK() internal view returns (string memory) {
        bytes memory pkBytes =  Suave.confidentialRetrieve(pkBidId, S_NAMESPACE);
        return string(pkBytes);
    }

}

// 🔧 Utils

function floatToInt(string memory floatString, uint8 decimals) pure returns (uint) {
    bytes memory stringBytes = bytes(floatString);
    uint dotPosition;
    
    // Find the position of the dot
    for (uint i = 0; i < stringBytes.length; i++) {
        if (stringBytes[i] == 0x2E) {
            dotPosition = i;
            break;
        }
    }
    
    uint integerPart = 0;
    uint decimalPart = 0;
    uint tenPower = 1;
    
    // Convert integer part
    for (uint i = dotPosition; i > 0; i--) {
        integerPart += (uint8(stringBytes[i - 1]) - 48) * tenPower;
        tenPower *= 10;
    }
    // Reset power of ten
    tenPower = 1;
    // Convert decimal part
    for (uint i = dotPosition+decimals; i > dotPosition; i--) {
        decimalPart += (uint8(stringBytes[i]) - 48) * tenPower;
        tenPower *= 10;
    }
    // Combine integer and decimal parts
    return integerPart * (10**decimals) + decimalPart;
}

function trimStrEdges(string memory _input) pure returns (string memory) {
    bytes memory input = bytes(_input);
    require(input.length > 2, "Input too short");

    uint newLength = input.length - 2;
    bytes memory result = new bytes(newLength);

    assembly {
        let inputPtr := add(input, 0x21)
        let resultPtr := add(result, 0x20)
        let length := mload(input)
        mstore(resultPtr, mload(inputPtr))
        mstore(result, newLength)
    }
    return string(result);
}

function getAddressForPk(string memory pk) view returns (address) {
    bytes32 digest = keccak256(abi.encode("yo"));
    bytes memory sig = Suave.signMessage(abi.encodePacked(digest), Suave.CryptoSignature.SECP256, pk);
    return recoverSigner(digest, sig);
}

function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) pure returns (address) {
    (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
    return ecrecover(_ethSignedMessageHash, v, r, s);
}

function splitSignature(bytes memory sig) pure returns (bytes32 r, bytes32 s, uint8 v) {
    require(sig.length == 65, "invalid signature length");
    assembly {
        r := mload(add(sig, 32))
        s := mload(add(sig, 64))
        v := byte(0, mload(add(sig, 96)))
    }
    if (v < 27) {
        v += 27;
    }
}