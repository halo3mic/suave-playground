// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;


contract OracleSettlementContract {

    struct PriceUpdate {
        uint price;
        uint blockNumber;
    }

    event PriceUpdated(string ticker, uint price);

    mapping(string => PriceUpdate) public latestPriceUpdate;
    address public controller;

    function register() external {
        require(controller == address(0), "Already registered");
        controller = msg.sender;
    }

    function updatePrice(string memory ticker, uint price) external {
        require(msg.sender == controller, "Only controller");
        latestPriceUpdate[ticker] = PriceUpdate(price, block.number);
        emit PriceUpdated(ticker, price);
    }

}