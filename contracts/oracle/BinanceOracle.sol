/**
TODO:
* Settlement contract
* Optional Backrunning
* Coinbase API
 */

// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.13;

import { AnyBundleContract, Suave } from "../standard_peekers/bids.sol";
import { SuaveContract } from "../blockad/lib/SuaveContract.sol";
import { floatToInt, trimStrEdges, getAddressForPk } from  "./lib/Utils.sol";
import "../../node_modules/solady/src/utils/JSONParserLib.sol";
import "../libraries/Transactions.sol";
import "../libraries/Bundle.sol";
import "solady/src/utils/LibString.sol";


contract BinanceOracle is SuaveContract {
    using JSONParserLib for *;

    uint public constant GOERLI_CHAINID = 5;
    string public constant GOERLI_CHAINID_STR = "0x5";
    uint8 public constant DECIMALS = 4;
    string public constant S_NAMESPACE = "oracle:v0:pksecret";
    string public constant URL_PARTIAL = "https://data-api.binance.vision/api/v3/ticker/price?symbol=";
    string public constant GOERLI_BUNDLE_ENDPOINT = "https://relay-goerli.flashbots.net";
    
    bool isInitialized;
    Suave.DataId public pkBidId;
    address public controller;

    event PriceSubmission(string ticker, uint price);

    // ⛓️ EVM Methods

    function confidentialConstructorCallback(Suave.DataId _pkBidId, address pkAddress) public {
        crequire(!isInitialized, "Already initialized");
        pkBidId = _pkBidId;
        controller = pkAddress;
        isInitialized = true;
    }

    // ! Warning: This method is not restricted and emitted events should not be relied upon
    function queryAndSubmitCallback(string memory ticker, uint price) public {
        emit PriceSubmission(ticker, price);
    }

    fallback() external payable {
        // Needed to accept MEVM calls with no callbacks
    }

    // 🤐 MEVM Methods

    function confidentialConstructor() external onlyConfidential returns (bytes memory) {
        crequire(!isInitialized, "Already initialized");
        string memory pk = Suave.privateKeyGen();
        address pkAddress = getAddressForPk(pk);
		Suave.DataId bidId = storePK(bytes(pk));

        return abi.encodeWithSelector(
            this.confidentialConstructorCallback.selector, 
            bidId, 
            pkAddress
        );
    }

    function queryAndSubmit(
        string memory ticker, 
        uint nonce, 
        uint64 settlementBlockNum
    ) external onlyConfidential returns (uint) {
        uint price = queryLatestPrice(ticker);
        submitPriceUpdate(price, nonce, settlementBlockNum);
        return price;
    }

    function queryLatestPrice(string memory ticker) public view returns (uint price) {
        bytes memory response = doBinanceQuery(ticker);
        JSONParserLib.Item memory parsedRes = string(response).parse();
        string memory priceStr = string(parsedRes.at('"price"').value());
        price = floatToInt(trimStrEdges(priceStr), DECIMALS);
    }

    function submitPriceUpdate(
        uint price, 
        uint nonce,
        uint64 settlementBlockNum
    ) internal {
        bytes memory signedTx = createTransaction(price, nonce);
        sendBundle(signedTx, settlementBlockNum);
    }

    function createTransaction(uint price, uint nonce) internal returns (bytes memory txSigned)  {
        Transactions.EIP155 memory transaction = Transactions.EIP155({
            nonce: nonce,
            gasPrice: 100 gwei,
            gas: 100_000,
            to: address(0),
            value: 0,
            data: abi.encode(price),
            chainId: GOERLI_CHAINID,
            v: 27,
            r: hex"1111111111111111111111111111111111111111111111111111111111111111",
            s: hex"1111111111111111111111111111111111111111111111111111111111111111"
        });
        bytes memory txRlp = Transactions.encodeRLP(transaction);
        string memory pk = retreivePK();
        txSigned = Suave.signEthTransaction(txRlp, GOERLI_CHAINID_STR, pk);
    }

    function sendBundle(bytes memory txSigned, uint64 settlementBlockNum) internal view {
        simulateTx(txSigned);
        sendTxViaBundle(txSigned, settlementBlockNum);
    }

    function simulateTx(bytes memory signedTx) internal view {
        bytes memory bundle = abi.encodePacked('{"txs": ["', LibString.toHexString(signedTx), '"]}');
        (bool successSim, bytes memory data) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        crequire(successSim,  string(abi.encodePacked("BundleSimulationFailed: ", string(data))));
    }

    function doBinanceQuery(string memory ticker) internal view returns (bytes memory) {
        string[] memory headers = new string[](1);
        headers[0] = "Content-Type: application/json";
        Suave.HttpRequest memory request = Suave.HttpRequest({
            url: string(abi.encodePacked(URL_PARTIAL, ticker)),
            method: 'GET',
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
            GOERLI_BUNDLE_ENDPOINT, 
            "eth_sendBundle", 
            bundleReqParams
        ));
        crequire(successReq, string(abi.encodePacked("BundleSubmissionFailed: ", string(dataReq))));
    }

    function bundleRequestParams(bytes[] memory txns, uint blockNumber) internal pure returns (bytes memory) {
        bytes memory params =
            abi.encodePacked('{"blockNumber": "', LibString.toHexString(blockNumber), '", "txs": [');
        for (uint256 i = 0; i < txns.length; i++) {
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

    function storePK(bytes memory pk) internal returns (Suave.DataId) {
		address[] memory peekers = new address[](3);
		peekers[0] = address(this);
		peekers[1] = Suave.FETCH_DATA_RECORDS;
		peekers[2] = Suave.CONFIDENTIAL_RETRIEVE;
		Suave.DataRecord memory secretBid = Suave.newDataRecord(0, peekers, peekers, S_NAMESPACE);
		Suave.confidentialStore(secretBid.id, S_NAMESPACE, pk);
		return secretBid.id;
	}

    function retreivePK() internal returns (string memory) {
        bytes memory pkBytes =  Suave.confidentialRetrieve(pkBidId, S_NAMESPACE);
        return string(pkBytes);
    }

}