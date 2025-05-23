// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/ITokenVesting.sol";

/**
 * @title TokenVestingFactory
 * @dev Her token için ayrı vesting sözleşmesi oluşturan factory
 */
contract TokenVestingFactory is Ownable {
    using Clones for address;
    
    address public immutable vestingImplementation;
    
    address[] public allVestingContracts;
    mapping(address => address) public tokenToVesting;
    
    event VestingContractCreated(
        address indexed token, 
        address vestingContract, 
        string tokenName, 
        string claimName
    );
    
    constructor(address _vestingImplementation) {
        vestingImplementation = _vestingImplementation;
        // ✅ EKLE: Constructor'da deployer'ı owner yap
        _transferOwnership(msg.sender);
    }
    
    /**
     * @dev Yeni token vesting sözleşmesi oluşturur
     */
    function createVestingContract(
        address _token,
        string memory _tokenName,
        string memory _claimName
    ) external onlyOwner returns (address) {
        require(tokenToVesting[_token] == address(0), "Vesting contract already exists for this token");
        
        address vestingContract = vestingImplementation.clone();
        
        // ✅ DÜZELT: Owner'ı factory'nin owner'ı yap (yani seni)
        ITokenVesting(vestingContract).initialize(_token, owner(), _claimName);
        
        tokenToVesting[_token] = vestingContract;
        allVestingContracts.push(vestingContract);
        
        emit VestingContractCreated(_token, vestingContract, _tokenName, _claimName);
        return vestingContract;
    }
    
    /**
     * @dev Tüm vesting sözleşme sayısını döndürür
     */
    function getVestingContractsCount() external view returns (uint256) {
        return allVestingContracts.length;
    }
    
    /**
     * @dev Belirli indeksteki vesting sözleşmesini döndürür
     */
    function getVestingContractAtIndex(uint256 _index) external view returns (address) {
        require(_index < allVestingContracts.length, "Index out of bounds");
        return allVestingContracts[_index];
    }
    
    /**
     * @dev Token için vesting sözleşmesini döndürür
     */
    function getVestingContractForToken(address _token) external view returns (address) {
        return tokenToVesting[_token];
    }
}