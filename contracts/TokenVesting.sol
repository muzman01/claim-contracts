
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ITokenVesting.sol";

/**
 * @title TokenVesting
 * @dev Basit ve kullanıcı dostu token vesting sistemi
 */
contract TokenVesting is ITokenVesting, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    bool private initialized;
    
    string public claimName;
    IERC20 public token;
    bool public claimEnabled;
    uint256 public totalDeposited;
    
    // Claim seviyesinde vesting konfigürasyonu
    VestingConfig public vestingConfig;
    
    mapping(address => ClaimerInfo) public claimers;
    address[] public claimerList;
    
    modifier onlyInitialized() {
        require(initialized, "Not initialized");
        _;
    }
    
    /**
     * @dev Factory tarafından başlatılır
     */
    function initialize(address _token, address _owner, string memory _name) external override {
        require(!initialized, "Already initialized");
        initialized = true;
        
        token = IERC20(_token);
        claimName = _name;
        _transferOwnership(_owner);
        
        // Varsayılan olarak vesting yok (hepsi hemen alınabilir)
        vestingConfig = VestingConfig({
            hasVesting: false,
            immediatePercent: 100,
            totalPeriods: 0,
            periodDuration: 0,
            vestingStartTime: 0
        });
    }
    
    /**
     * @dev Claim'i aktif/pasif yapar
     */
    function toggleClaim(bool _isActive) external override onlyOwner onlyInitialized {
        claimEnabled = _isActive;
        emit ClaimToggled(_isActive);
    }
    
    /**
     * @dev Vesting parametrelerini ayarlar (tüm claimerlar için geçerli)
     */
    function setupVesting(
        uint256 _immediatePercent,
        uint256 _totalPeriods,
        uint256 _periodDuration
    ) external override onlyOwner onlyInitialized {
        require(_immediatePercent <= 100, "Immediate percent cannot exceed 100");
        require(claimerList.length == 0, "Cannot change vesting after adding claimers");
        
        vestingConfig = VestingConfig({
            hasVesting: _totalPeriods > 0,
            immediatePercent: _immediatePercent,
            totalPeriods: _totalPeriods,
            periodDuration: _periodDuration,
            vestingStartTime: block.timestamp
        });
        
        emit VestingConfigured(_immediatePercent, _totalPeriods, _periodDuration);
    }
    
    /**
     * @dev Claim'e token yatırır
     */
    function depositTokens(uint256 _amount) external override onlyOwner onlyInitialized {
        require(_amount > 0, "Amount must be greater than 0");
        
        token.safeTransferFrom(msg.sender, address(this), _amount);
        totalDeposited += _amount;
        
        emit TokensDeposited(_amount);
    }
    
    /**
     * @dev Claimer ekler (claim seviyesindeki vesting ayarları otomatik uygulanır)
     */
    function addClaimer(
        address _claimer,
        uint256 _amount
    ) external override onlyOwner onlyInitialized {
        require(_claimer != address(0), "Invalid claimer address");
        require(_amount > 0, "Amount must be greater than zero");
        require(claimers[_claimer].totalAmount == 0, "Claimer already exists");
        
        claimers[_claimer] = ClaimerInfo({
            totalAmount: _amount,
            claimedAmount: 0,
            immediateClaimed: false
        });
        
        claimerList.push(_claimer);
        emit ClaimerAdded(_claimer, _amount);
    }
    
    /**
     * @dev İlk ödemeyi claim eder
     */
    function claimImmediate() external override nonReentrant onlyInitialized {
        require(claimEnabled, "Claiming is not enabled");
        require(claimers[msg.sender].totalAmount > 0, "Not authorized to claim");
        require(!claimers[msg.sender].immediateClaimed, "Immediate payment already claimed");
        
        uint256 immediateAmount = (claimers[msg.sender].totalAmount * vestingConfig.immediatePercent) / 100;
        require(immediateAmount > 0, "No immediate payment available");
        
        claimers[msg.sender].immediateClaimed = true;
        claimers[msg.sender].claimedAmount += immediateAmount;
        
        token.safeTransfer(msg.sender, immediateAmount);
        emit TokensClaimed(msg.sender, immediateAmount, "Immediate");
    }
    
    /**
     * @dev Vesting ödemesini claim eder
     */
    function claimVesting() external override nonReentrant onlyInitialized {
        require(claimEnabled, "Claiming is not enabled");
        require(claimers[msg.sender].totalAmount > 0, "Not authorized to claim");
        require(vestingConfig.hasVesting, "No vesting configured");
        
        uint256 vestingAmount = _calculateVestingAmount(msg.sender);
        require(vestingAmount > 0, "No vesting tokens available");
        
        claimers[msg.sender].claimedAmount += vestingAmount;
        
        token.safeTransfer(msg.sender, vestingAmount);
        emit TokensClaimed(msg.sender, vestingAmount, "Vesting");
    }
    
    /**
     * @dev Claim edilebilir miktarları hesaplar
     */
    function getClaimableAmount(address _claimer) external view override returns (uint256 immediate, uint256 vesting) {
        ClaimerInfo memory claimer = claimers[_claimer];
        if (claimer.totalAmount == 0) return (0, 0);
        
        // İlk ödeme
        if (!claimer.immediateClaimed) {
            immediate = (claimer.totalAmount * vestingConfig.immediatePercent) / 100;
        }
        
        // Vesting ödeme
        if (vestingConfig.hasVesting) {
            vesting = _calculateVestingAmount(_claimer);
        }
    }
    
    /**
     * @dev Vesting miktarını hesaplar
     */
    function _calculateVestingAmount(address _claimer) internal view returns (uint256) {
        ClaimerInfo memory claimer = claimers[_claimer];
        
        if (!vestingConfig.hasVesting || vestingConfig.totalPeriods == 0) {
            return 0;
        }
        
        uint256 timePassed = block.timestamp - vestingConfig.vestingStartTime;
        uint256 periodsPassed = timePassed / vestingConfig.periodDuration;
        
        if (periodsPassed == 0) {
            return 0;
        }
        
        // Maksimum periyot sayısını aşmasın
        if (periodsPassed > vestingConfig.totalPeriods) {
            periodsPassed = vestingConfig.totalPeriods;
        }
        
        // Vesting kısmının toplam miktarı
        uint256 vestingTotalAmount = claimer.totalAmount - ((claimer.totalAmount * vestingConfig.immediatePercent) / 100);
        
        // Her periyot için düşen miktar
        uint256 amountPerPeriod = vestingTotalAmount / vestingConfig.totalPeriods;
        
        // Şu ana kadar serbest bırakılan toplam vesting miktarı
        uint256 totalVestedAmount = periodsPassed * amountPerPeriod;
        
        // İlk ödeme dışında şu ana kadar claim edilen miktar
        uint256 immediateAmount = (claimer.totalAmount * vestingConfig.immediatePercent) / 100;
        uint256 vestingClaimed = claimer.claimedAmount - (claimer.immediateClaimed ? immediateAmount : 0);
        
        return totalVestedAmount - vestingClaimed;
    }
    
    /**
     * @dev Claim aktif mi?
     */
    function isActive() external view override returns (bool) {
        return claimEnabled;
    }
    
    /**
     * @dev Claimer bilgilerini döndürür
     */
    function getClaimerInfo(address _claimer) external view override returns (ClaimerInfo memory) {
        return claimers[_claimer];
    }
    
    /**
     * @dev Vesting konfigürasyonunu döndürür
     */
    function getVestingConfig() external view override returns (VestingConfig memory) {
        return vestingConfig;
    }
    
    /**
     * @dev Toplam claimer sayısını döndürür
     */
    function getClaimersCount() external view returns (uint256) {
        return claimerList.length;
    }
    
    /**
     * @dev Belirli indeksteki claimer'ı döndürür
     */
    function getClaimerAtIndex(uint256 _index) external view returns (address) {
        require(_index < claimerList.length, "Index out of bounds");
        return claimerList[_index];
    }
    
    /**
     * @dev Acil durum token kurtarma
     */
    function rescueTokens(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), _amount);
    }
}
