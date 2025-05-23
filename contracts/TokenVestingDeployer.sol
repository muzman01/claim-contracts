// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./TokenVesting.sol";
import "./TokenVestingFactory.sol";

/**
 * @title TokenVestingDeployer
 * @dev Factory ve implementation sözleşmesini deploy etmek için kullanılır
 */
contract TokenVestingDeployer {
    address public factory;
    address public implementation;
    address public deployer; // ✅ EKLE: Deployer'ı track et
    
    // ✅ EKLE: Events
    event ContractsDeployed(address factory, address implementation);
    event FactoryOwnershipTransferred(address newOwner);
    
    constructor() {
        deployer = msg.sender; // ✅ EKLE: Deployer'ı kaydet
        
        // Önce implementation sözleşmesini deploy et
        implementation = address(new TokenVesting());
        
        // Sonra factory'yi implementation ile deploy et
        factory = address(new TokenVestingFactory(implementation));
        
        // ✅ EKLE: Factory ownership'ini deployer'a transfer et
        TokenVestingFactory(factory).transferOwnership(msg.sender);
        
        emit ContractsDeployed(factory, implementation);
        emit FactoryOwnershipTransferred(msg.sender);
    }
    
    // ✅ EKLE: Factory owner'ını kontrol etmek için
    function getFactoryOwner() external view returns (address) {
        return TokenVestingFactory(factory).owner();
    }
    
    // ✅ EKLE: Manuel ownership transfer (acil durum için)
    function transferFactoryOwnership(address newOwner) external {
        require(msg.sender == deployer, "Only original deployer");
        require(newOwner != address(0), "Invalid address");
        
        TokenVestingFactory(factory).transferOwnership(newOwner);
        emit FactoryOwnershipTransferred(newOwner);
    }
    
    // ✅ EKLE: Info fonksiyonu
    function getInfo() external view returns (
        address _factory,
        address _implementation, 
        address _deployer,
        address _factoryOwner
    ) {
        return (
            factory,
            implementation,
            deployer,
            TokenVestingFactory(factory).owner()
        );
    }
}