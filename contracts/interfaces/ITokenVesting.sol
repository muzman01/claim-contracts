
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ITokenVesting
 * @dev Basitleştirilmiş TokenVesting arayüzü
 */
interface ITokenVesting {
    struct ClaimerInfo {
        uint256 totalAmount;
        uint256 claimedAmount;
        bool immediateClaimed;     // İlk ödeme alındı mı?
    }
    
    struct VestingConfig {
        bool hasVesting;           // Bu claim vesting'li mi?
        uint256 immediatePercent;  // İlk verilecek yüzde (0-100)
        uint256 totalPeriods;      // Toplam periyot sayısı
        uint256 periodDuration;    // Her periyot süresi (saniye)
        uint256 vestingStartTime;  // Vesting başlangıç zamanı
    }
    
    // Events
    event ClaimToggled(bool isActive);
    event VestingConfigured(uint256 immediatePercent, uint256 totalPeriods, uint256 periodDuration);
    event ClaimerAdded(address indexed claimer, uint256 amount);
    event TokensClaimed(address indexed claimer, uint256 amount, string claimType);
    event TokensDeposited(uint256 amount);
    
    // Factory functions
    function initialize(address _token, address _owner, string memory _name) external;
    
    // Admin functions
    function toggleClaim(bool _isActive) external;
    function depositTokens(uint256 _amount) external;
    function setupVesting(uint256 _immediatePercent, uint256 _totalPeriods, uint256 _periodDuration) external;
    function addClaimer(address _claimer, uint256 _amount) external;
    
    // User functions
    function claimImmediate() external;
    function claimVesting() external;
    function getClaimableAmount(address _claimer) external view returns (uint256 immediate, uint256 vesting);
    
    // View functions
    function isActive() external view returns (bool);
    function getClaimerInfo(address _claimer) external view returns (ClaimerInfo memory);
    function getVestingConfig() external view returns (VestingConfig memory);
}
