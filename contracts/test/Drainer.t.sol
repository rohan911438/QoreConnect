// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Drainer} from "../src/Drainer.sol";

contract Sink {
    receive() external payable {
        revert("closed");
    }
}

contract DrainerTest is Test {
    Drainer drainer;
    address payable attacker = payable(makeAddr("attacker"));
    address victim = makeAddr("victim");

    function setUp() public {
        drainer = new Drainer(attacker);
        vm.deal(victim, 10 ether);
    }

    function test_DrainForwardsEverythingToAttacker() public {
        vm.prank(victim);
        drainer.drain{value: 4 ether}();
        assertEq(attacker.balance, 4 ether);
        assertEq(address(drainer).balance, 0);
        assertEq(drainer.totalStolen(), 4 ether);
    }

    function test_ClaimAirdropIsTheSameTrap() public {
        vm.prank(victim);
        drainer.claimAirdrop{value: 1 ether}();
        assertEq(attacker.balance, 1 ether);
        assertEq(drainer.totalStolen(), 1 ether);
    }

    function test_RevertWhenAttackerRejects() public {
        Drainer d = new Drainer(payable(address(new Sink())));
        vm.prank(victim);
        vm.expectRevert(Drainer.TransferFailed.selector);
        d.drain{value: 1}();
        vm.prank(victim);
        vm.expectRevert(Drainer.TransferFailed.selector);
        d.claimAirdrop{value: 1}();
    }

    function testFuzz_Drain(uint64 v) public {
        vm.deal(victim, v);
        vm.prank(victim);
        drainer.drain{value: v}();
        assertEq(attacker.balance, v);
    }
}
