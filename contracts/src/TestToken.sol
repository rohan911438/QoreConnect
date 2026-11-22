// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title QoreConnect Test Token (TESTNET ONLY, no value)
/// @notice Minimal ERC-20 used to demonstrate the approval scanner and one-click revoke on Diana testnet.
///         Anyone can take 100 QCT once per address from the faucet. Never deploy to a network with real value.
contract TestToken {
    string public constant name = "QoreConnect Test Token";
    string public constant symbol = "QCT";
    uint8 public constant decimals = 18;
    uint256 public constant FAUCET_AMOUNT = 100e18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public claimed;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error AlreadyClaimed();
    error InsufficientBalance();
    error InsufficientAllowance();

    function faucet() external {
        if (claimed[msg.sender]) revert AlreadyClaimed();
        claimed[msg.sender] = true;
        totalSupply += FAUCET_AMOUNT;
        balanceOf[msg.sender] += FAUCET_AMOUNT;
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - value;
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
