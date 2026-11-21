// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

contract SpikeCounter {
    uint256 public count;
    address public lastSender;
    uint256 public tips;

    event Incremented(address indexed sender, uint256 count);

    function increment() external {
        count += 1;
        lastSender = msg.sender;
        emit Incremented(msg.sender, count);
    }

    function tip() external payable {
        tips += msg.value;
        lastSender = msg.sender;
    }
}
