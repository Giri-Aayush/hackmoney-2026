// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/OptiChannelSettlement.sol";

/**
 * @title DeployOptiChannelSepolia
 * @notice Deployment script for OptiChannelSettlement contract on Ethereum Sepolia
 *
 * To deploy:
 * forge script script/Deploy.s.sol:DeployOptiChannelSepolia --rpc-url sepolia --broadcast --verify
 */
contract DeployOptiChannelSepolia is Script {
    // Ethereum Sepolia addresses
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;  // Circle USDC on Sepolia
    address constant PYTH = 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21;  // Pyth on Sepolia
    bytes32 constant ETH_USD_PRICE_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        OptiChannelSettlement settlement = new OptiChannelSettlement(
            USDC,
            PYTH,
            ETH_USD_PRICE_ID
        );

        console.log("========================================");
        console.log("OptiChannelSettlement Deployed!");
        console.log("========================================");
        console.log("Contract:", address(settlement));
        console.log("Chain: Ethereum Sepolia (11155111)");
        console.log("USDC:", USDC);
        console.log("Pyth:", PYTH);
        console.log("========================================");

        vm.stopBroadcast();
    }
}

/**
 * @title DeployOptiChannelMainnet
 * @notice Deployment script for Ethereum Mainnet
 *
 * To deploy:
 * forge script script/Deploy.s.sol:DeployOptiChannelMainnet --rpc-url mainnet --broadcast --verify
 */
contract DeployOptiChannelMainnet is Script {
    // Ethereum Mainnet addresses
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;  // USDC on Mainnet
    address constant PYTH = 0x4305FB66699C3B2702D4d05CF36551390A4c69C6;  // Pyth on Mainnet
    bytes32 constant ETH_USD_PRICE_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        OptiChannelSettlement settlement = new OptiChannelSettlement(
            USDC,
            PYTH,
            ETH_USD_PRICE_ID
        );

        console.log("========================================");
        console.log("OptiChannelSettlement Deployed!");
        console.log("========================================");
        console.log("Contract:", address(settlement));
        console.log("Chain: Ethereum Mainnet (1)");
        console.log("USDC:", USDC);
        console.log("Pyth:", PYTH);
        console.log("========================================");

        vm.stopBroadcast();
    }
}
