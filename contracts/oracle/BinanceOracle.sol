// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { AnyBundleContract, Suave } from "../standard_peekers/bids.sol";
import { SuaveContract } from "../blockad/lib/SuaveContract.sol";
import { floatToInt, trimStrEdges } from  "./lib/Utils.sol";
import "solady/src/utils/JSONParserLib.sol";
import "suave-std/src/Transactions.sol";


contract BinanceOracle is SuaveContract {
    using JSONParserLib for *;

    uint8 public constant DECIMALS = 4;
    string public constant URL_PARTIAL = "https://data-api.binance.vision/api/v3/ticker/price?symbol=";
    mapping(uint => string) public idxToTicker;

    event Log(string message);

    function queryLatestPriceCallback(bytes memory response) public {
        emit Log(string(response));
    }

    function queryLatestPrice(string memory ticker) external view returns (bytes memory) {
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
        uint price = floatToInt(trimStrEdges(priceStr), DECIMALS);

        return abi.encode(this.queryLatestPriceCallback.selector, abi.encode(price));
    }

    function doHttpRequest(Suave.HttpRequest memory request) internal view returns (bytes memory) {
        (bool success, bytes memory data) = Suave.DO_HTTPREQUEST.staticcall(abi.encode(request));
        crequire(success, string(data));
        return abi.decode(data, (bytes));
    }

}