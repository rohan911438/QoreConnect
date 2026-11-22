// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestToken} from "../src/TestToken.sol";

contract TestTokenTest is Test {
    TestToken t;
    address alice = address(0xA11CE);
    address spender = address(0xBEEF);

    function setUp() public {
        t = new TestToken();
    }

    function test_faucetOncePerAddress() public {
        vm.prank(alice);
        t.faucet();
        assertEq(t.balanceOf(alice), 100e18);
        vm.prank(alice);
        vm.expectRevert(TestToken.AlreadyClaimed.selector);
        t.faucet();
    }

    function test_approveSpendRevoke() public {
        vm.prank(alice);
        t.faucet();
        vm.prank(alice);
        t.approve(spender, type(uint256).max);
        vm.prank(spender);
        t.transferFrom(alice, spender, 10e18);
        assertEq(t.allowance(alice, spender), type(uint256).max, "unlimited allowance is not reduced");
        vm.prank(alice);
        t.approve(spender, 0);
        vm.prank(spender);
        vm.expectRevert(TestToken.InsufficientAllowance.selector);
        t.transferFrom(alice, spender, 1);
    }
}
