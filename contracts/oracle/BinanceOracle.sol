// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.13;

import { AnyBundleContract, Suave } from "../standard_peekers/bids.sol";
import { SuaveContract } from "../blockad/lib/SuaveContract.sol";
import { floatToInt, trimStrEdges } from  "./lib/Utils.sol";
import "../../node_modules/solady/src/utils/JSONParserLib.sol";
import "../libraries/Transactions.sol";
import "../libraries/Bundle.sol";
import "solady/src/utils/LibString.sol";



contract BinanceOracle is SuaveContract {
    using JSONParserLib for *;

    uint public constant GOERLI_CHAINID = 5;
    string public constant GOERLI_CHAINID_STR = "0x5";
    uint8 public constant DECIMALS = 4;
    string public constant URL_PARTIAL = "https://data-api.binance.vision/api/v3/ticker/price?symbol=";
    string public constant GOERLI_BUNDLE_ENDPOINT = "https://relay-goerli.flashbots.net";
    mapping(uint => string) public idxToTicker;

    event Log(string message);

    function queryLatestPriceCallback(bytes memory response) public {
        emit Log(string(response));
    }

    function queryLatestPrice(string memory ticker) public view returns (uint price) {
        string[] memory headers = new string[](1);
        headers[0] = "Content-Type: application/json";
        Suave.HttpRequest memory request = Suave.HttpRequest({
            url: string(abi.encodePacked(URL_PARTIAL, ticker)),
            method: 'GET',
            headers: headers,
            body: new bytes(0),
            withFlashbotsSignature: false
        });
        bytes memory response = doHttpRequest(request);
        JSONParserLib.Item memory parsedRes = string(response).parse();
        
        string memory priceStr = string(parsedRes.at('"price"').value());
        price = floatToInt(trimStrEdges(priceStr), DECIMALS);
    }

    function doHttpRequest(Suave.HttpRequest memory request) internal view returns (bytes memory) {
        (bool success, bytes memory data) = Suave.DO_HTTPREQUEST.staticcall(abi.encode(request));
        crequire(success, string(data));
        return abi.decode(data, (bytes));
    }

    /*
        1. Create a transaction and sign it (try posting it on Goerli)
        2. Find a way to do better nonce management 
        3. Send tx as a bundle
        4. Create a way to store PK in a secure way
        5. Create Goerli contract for collecting prices 
        6. Collect at least N(eg 10) price updates in the same block before updates can be posted on Goerli
    */

    function queryAndSubmit(string memory ticker, uint nonce, uint64 settlementBlockNum) public {
        uint price = queryLatestPrice(ticker);
        createTransaction(price, nonce, settlementBlockNum);
    }

    function createTransaction(uint price, uint nonce, uint64 settlementBlockNum) public returns (bytes memory)  {
        Transactions.EIP155 memory transaction = Transactions.EIP155({
            nonce: nonce,
            gasPrice: 1 gwei,
            gas: 100_000,
            to: address(0),
            value: 0,
            data: abi.encode(price),
            chainId: GOERLI_CHAINID,
            v: 27,
            r: hex"9bea4c4daac7c7c52e093e6a4c35dbbcf8856f1af7b059ba20253e70848d094f",
            s: hex"8a8fae537ce25ed8cb5af9adac3f141af69bd515bd2ba031522df09b97dd72b1"
        });
        bytes memory txRlp = Transactions.encodeRLP(transaction);
        string memory pk = "";
        bytes memory txSigned = Suave.signEthTransaction(txRlp, GOERLI_CHAINID_STR, pk);

        // crequire(false, string(txSigned));

        sendBundle(txSigned, settlementBlockNum);

        return new bytes(0);
    }

    error SimError(bool success, string message);
    error SimErrorBytes(bool success, bytes message);

    function sendBundle(bytes memory txSigned, uint64 settlementBlockNum) public {

        bytes memory bundle = abi.encodePacked('{"txs": ["', LibString.toHexString(txSigned), '"]}');
        (bool successSim,) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        crequire(successSim, "Bundle simulation failed");

        bytes memory bundleReqParams = bundleRequestParams(txSigned, settlementBlockNum);

        (bool successReq, bytes memory dataReq) = Suave.SUBMIT_BUNDLE_JSON_RPC.staticcall(abi.encode(
            GOERLI_BUNDLE_ENDPOINT, 
            "eth_sendBundle", 
            bundleReqParams
        ));

        revert SimError(successReq, string(dataReq));

        // Bundle.BundleObj memory bundle = Bundle.BundleObj({
        //     blockNumber: settlementBlockNum,
        //     minTimestamp: 0,
        //     maxTimestamp: 0,
        //     txns: new bytes[](1)
        // });
        // bundle.txns[0] = txSigned;

        // Suave.HttpRequest memory bundleRequest = Bundle.encodeBundle(bundle);

        // bytes memory params = abi.encodePacked('{"txs": [');
        // for (uint256 i = 0; i < args.txns.length; i++) {
        //     params = abi.encodePacked(params, '"', LibString.toHexString(args.txns[i]), '"');
        //     if (i < args.txns.length - 1) {
        //         params = abi.encodePacked(params, ",");
        //     } else {
        //         params = abi.encodePacked(params, "]}");
        //     }
        // }
        


        // revert SimErrorBytes(success, data);
        // Suave.simulateBundle(bundleRequest.body);

        // string memory url = "https://relay-goerli.flashbots.net";
        // bytes memory response = Bundle.sendBundle(url, bundle);
        // crequire(false, string(response));
    }

    function bundleRequestParams(bytes memory txn, uint64 settlementBlockNum) public view returns (bytes memory) {
        bytes[] memory txns = new bytes[](1);
        txns[0] = txn;
        uint64 blockNumber = settlementBlockNum;

        bytes memory params =
            abi.encodePacked('{"blockNumber": "', LibString.toHexString(uint(blockNumber)), '", "txs": [');
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

    fallback() external payable {
    }

}