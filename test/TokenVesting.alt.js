const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Token Vesting Periyodik ve Çoklu Claim Testleri", function () {
  // Sözleşmeler
  let deployer, factory, implementation, mockToken, vestingContract;
  // Adresler
  let owner, user1, user2, user3;
  
  // Sabitler
  const ONE_DAY = 86400; // 1 gün (saniye)
  const ONE_WEEK = ONE_DAY * 7; // 1 hafta (saniye)
  const ONE_MONTH = ONE_DAY * 30; // 1 ay (saniye)
  const CLIFF_DURATION = ONE_MONTH / 3; // 10 günlük cliff
  const VESTING_DURATION = ONE_MONTH; // 30 günlük vesting
  const TOTAL_AMOUNT = "1000000000000000000000000"; // 1,000,000 token
  
  // Farklı kullanıcılar için farklı parametreler
  const USER1_AMOUNT = "1000000000000000000000"; // 1,000 token
  const USER2_AMOUNT = "2000000000000000000000"; // 2,000 token
  const USER3_AMOUNT = "5000000000000000000000"; // 5,000 token
  
  // Farklı periyotlar
  const DAILY_RELEASE = ONE_DAY; // Günlük
  const WEEKLY_RELEASE = ONE_WEEK; // Haftalık
  const BIWEEKLY_RELEASE = ONE_WEEK * 2; // İki haftalık
  
  // Yardımcı Fonksiyonlar - Ethers.js v6 uyumlu
  const getBigInt = (str) => {
    try {
      return BigInt(str);
    } catch (e) {
      console.error("getBigInt error:", e);
      return BigInt(0);
    }
  };
  
  const getContractAddress = (contract) => {
    return contract.target || contract.address;
  };
  
  const multiplyBigInts = (valueStr, multiplier) => {
    // Ondalık sayıyı int olarak kabul etmek için gerekli düzeltme
    if (typeof multiplier === 'number' && !Number.isInteger(multiplier)) {
      // Ondalık sayıyı tam sayıya dönüştür ve emniyet faktörü ekle
      multiplier = Math.floor(multiplier);
    }
    return (getBigInt(valueStr) * BigInt(multiplier)).toString();
  };
  
  const divideBigInts = (valueStr, divisor) => {
    // BigInt bölme işlemi ondalık sonuç üretmez
    // Bu nedenle sadece tam kısmı döndürür
    return (getBigInt(valueStr) / BigInt(divisor)).toString();
  };

  const addBigInts = (valueStr1, valueStr2) => {
    return (getBigInt(valueStr1) + getBigInt(valueStr2)).toString();
  };

  const subtractBigInts = (valueStr1, valueStr2) => {
    return (getBigInt(valueStr1) - getBigInt(valueStr2)).toString();
  };
  
  const isGreaterThan = (valueStr1, valueStr2) => {
    return getBigInt(valueStr1) > getBigInt(valueStr2);
  };
  
  const isEqual = (valueStr1, valueStr2) => {
    return getBigInt(valueStr1) === getBigInt(valueStr2);
  };
  
  // Token miktarını daha okunabilir formata dönüştür
  const formatTokenAmount = (amountStr) => {
    const amount = getBigInt(amountStr);
    const decimals = getBigInt("1000000000000000000"); // 10^18
    const tokens = Number(amount / decimals);
    const remainder = Number(amount % decimals) / Number(decimals);
    return tokens + remainder;
  };
  
  before(async function() {
    [owner, user1, user2, user3] = await ethers.getSigners();
    console.log("Test accounts:");
    console.log(" - Owner:", owner.address);
    console.log(" - User1:", user1.address);
    console.log(" - User2:", user2.address);
    console.log(" - User3:", user3.address);
  });
  
  // Her test öncesi sözleşmeleri deploy et
  beforeEach(async function() {
    console.log("\nDeploying contracts...");
    
    try {
      // Mock Token deploy et
      const MockToken = await ethers.getContractFactory("AlternateMockERC20");
      mockToken = await MockToken.deploy("Mock Token", "MCK", TOTAL_AMOUNT);
      
      // Deployment'ın tamamlandığından emin ol
      const mockTokenTx = await mockToken.deploymentTransaction();
      await mockTokenTx.wait(1); // En az 1 onay bekle
      
      const mockTokenAddress = getContractAddress(mockToken);
      console.log("Mock Token deployed at:", mockTokenAddress);
      
      // Doğrudan TokenVesting ve TokenVestingFactory deploy et
      const TokenVesting = await ethers.getContractFactory("TokenVesting");
      implementation = await TokenVesting.deploy();
      await implementation.deploymentTransaction().wait(1);
      console.log("Implementation deployed at:", getContractAddress(implementation));
      
      const TokenVestingFactory = await ethers.getContractFactory("TokenVestingFactory");
      factory = await TokenVestingFactory.deploy(getContractAddress(implementation));
      await factory.deploymentTransaction().wait(1);
      console.log("Factory deployed at:", getContractAddress(factory));
      
      // Factory'nin owner'ını kontrol et
      const factoryOwner = await factory.owner();
      console.log("Factory owner:", factoryOwner);
      
      // Token için vesting kontratı oluştur
      const tx = await factory.createVestingContract(
        mockTokenAddress,
        "Test Token",
        "TST"
      );
      const receipt = await tx.wait();
      
      // Event'i bul - Ethers.js v6 için uyumlu yöntem
      let vestingContractAddress;
      // Log'ları kontrol et
      for (const log of receipt.logs) {
        try {
          // Her log'un dekode edilmesini dene
          const parsedLog = factory.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          if (parsedLog && parsedLog.name === "VestingContractCreated") {
            vestingContractAddress = parsedLog.args.vestingContract;
            break;
          }
        } catch (e) {
          // Bu log dekode edilemedi, devam et
          continue;
        }
      }
      
      if (!vestingContractAddress) {
        throw new Error("VestingContractCreated event not found!");
      }
      
      console.log("Vesting contract created at:", vestingContractAddress);
      
      // Vesting kontratını al
      vestingContract = await ethers.getContractAt("TokenVesting", vestingContractAddress);
      
      // Vesting kontrat owner'ını kontrol et
      const vestingOwner = await vestingContract.owner();
      console.log("Vesting contract owner:", vestingOwner);
      
      // Token için approval ver ve vesting kontratına gönder
      await mockToken.approve(vestingContractAddress, TOTAL_AMOUNT);
      await vestingContract.depositTokens(TOTAL_AMOUNT);
      console.log("Deposited tokens to vesting contract");
      
      // Claim'i etkinleştir
      await vestingContract.setClaimEnabled(true);
      console.log("Claiming is enabled");
    } catch (error) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });
  
  describe("1. Periyodik Release Testleri", function() {
    it("1.1 Günlük periyotta claim - Her gün tokenlerin aşamalı olarak açılması", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      console.log("Current timestamp:", startTime);
      
      // User1 için günlük release periyodu olan vesting oluştur (cliff yok)
      await vestingContract.addClaimer(
        user1.address,
        USER1_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        DAILY_RELEASE // Günlük release
      );
      
      console.log(`Vesting created for User1: ${formatTokenAmount(USER1_AMOUNT)} tokens, daily release`);
      
      // İlk gün için claim edilebilir miktar
      let claimableDay1 = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("Initial claimable amount:", formatTokenAmount(claimableDay1.toString()), "tokens");
      
      // 1 gün sonra
      await network.provider.send("evm_increaseTime", [ONE_DAY]);
      await network.provider.send("evm_mine");
      
      const claimableDay2 = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("Claimable after 1 day:", formatTokenAmount(claimableDay2.toString()), "tokens");
      
      // Günlük ortalama release miktarı (toplam / gün sayısı)
      const expectedDailyAmount = divideBigInts(USER1_AMOUNT, VESTING_DURATION / ONE_DAY);
      console.log("Expected daily release:", formatTokenAmount(expectedDailyAmount), "tokens");
      
      // Claim işlemi
      await vestingContract.connect(user1).claim();
      
      // User1'in tokenleri aldığını doğrula
      const balanceAfterDay1 = await mockToken.balanceOf(user1.address);
      console.log("User1 balance after day 1 claim:", formatTokenAmount(balanceAfterDay1.toString()), "tokens");
      
      // 2. gün için claim
      await network.provider.send("evm_increaseTime", [ONE_DAY]);
      await network.provider.send("evm_mine");
      
      const claimableDay3 = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("Claimable after 2 days (day 3):", formatTokenAmount(claimableDay3.toString()), "tokens");
      
      // Claim işlemi
      await vestingContract.connect(user1).claim();
      
      // User1'in tokenleri aldığını doğrula
      const balanceAfterDay2 = await mockToken.balanceOf(user1.address);
      console.log("User1 balance after day 3 claim:", formatTokenAmount(balanceAfterDay2.toString()), "tokens");
      
      // Toplam 2 gün için claim edilmesi beklenen miktar
      const expectedTotalForTwoDays = multiplyBigInts(expectedDailyAmount, 2);
      console.log("Expected total for 2 days:", formatTokenAmount(expectedTotalForTwoDays), "tokens");
      
      // Kullanıcı bakiyesinin yaklaşık beklenen miktara yakın olduğunu doğrula
      // Math.floor kullanarak tam sayı karşılaştırması yapıyoruz
      const lowerBound = multiplyBigInts(expectedDailyAmount, 1);
      const upperBound = multiplyBigInts(expectedDailyAmount, 3);
      
      expect(isGreaterThan(balanceAfterDay2.toString(), lowerBound)).to.be.true;
      expect(isGreaterThan(upperBound, balanceAfterDay2.toString())).to.be.true;
    });
    
    it("1.2 Haftalık periyotta claim - Tüm hafta boyunca tokenlerin kilitte kalması", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      console.log("Current timestamp:", startTime);
      
      // User2 için haftalık release periyodu olan vesting oluştur
      await vestingContract.addClaimer(
        user2.address,
        USER2_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        WEEKLY_RELEASE // Haftalık release
      );
      
      console.log(`Vesting created for User2: ${formatTokenAmount(USER2_AMOUNT)} tokens, weekly release`);
      
      // Başlangıçta claim edilebilir miktar
      const initialClaimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Initial claimable amount:", formatTokenAmount(initialClaimable.toString()), "tokens");
      expect(initialClaimable.toString()).to.equal("0");
      
      // Hafta ortası (3 gün sonra) - hala 0 olmalı
      await network.provider.send("evm_increaseTime", [ONE_DAY * 3]);
      await network.provider.send("evm_mine");
      
      const midWeekClaimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Mid-week claimable:", formatTokenAmount(midWeekClaimable.toString()), "tokens");
      expect(midWeekClaimable.toString()).to.equal("0");
      
      // 1 hafta sonra
      await network.provider.send("evm_increaseTime", [ONE_DAY * 4]); // 3 gün + 4 gün = 1 hafta
      await network.provider.send("evm_mine");
      
      // Şimdi claim edilebilir miktar olmalı
      const oneWeekClaimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("One week claimable:", formatTokenAmount(oneWeekClaimable.toString()), "tokens");
      expect(isGreaterThan(oneWeekClaimable.toString(), "0")).to.be.true;
      
      // Haftalık ortalama release miktarı - tam sayı olarak hesapla
      const totalWeeks = Math.floor(VESTING_DURATION / ONE_WEEK);
      const expectedWeeklyAmount = divideBigInts(USER2_AMOUNT, totalWeeks);
      console.log("Expected weekly release:", formatTokenAmount(expectedWeeklyAmount), "tokens");
      
      // Claim işlemi
      await vestingContract.connect(user2).claim();
      
      // User2'nin tokenleri aldığını doğrula
      const balanceAfterWeek1 = await mockToken.balanceOf(user2.address);
      console.log("User2 balance after week 1 claim:", formatTokenAmount(balanceAfterWeek1.toString()), "tokens");
      
      // Bir gün daha ilerlet - claim edilebilir miktar değişmemeli
      await network.provider.send("evm_increaseTime", [ONE_DAY]);
      await network.provider.send("evm_mine");
      
      const afterOneMoreDayClaimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Claimable after one more day:", formatTokenAmount(afterOneMoreDayClaimable.toString()), "tokens");
      expect(afterOneMoreDayClaimable.toString()).to.equal("0");
      
      // 2. hafta tamamlanana kadar ilerlet
      await network.provider.send("evm_increaseTime", [ONE_DAY * 6]); // 1 gün + 6 gün = 1 hafta
      await network.provider.send("evm_mine");
      
      // 2. hafta için claim edilebilir miktar
      const twoWeeksClaimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Two weeks claimable:", formatTokenAmount(twoWeeksClaimable.toString()), "tokens");
      expect(isGreaterThan(twoWeeksClaimable.toString(), "0")).to.be.true;
      
      // Claim işlemi
      await vestingContract.connect(user2).claim();
      
      // User2'nin toplam 2 haftalık tokenleri aldığını doğrula
      const balanceAfterWeek2 = await mockToken.balanceOf(user2.address);
      console.log("User2 balance after week 2 claim:", formatTokenAmount(balanceAfterWeek2.toString()), "tokens");
      
      // Toplam 2 hafta için claim edilmesi beklenen miktar
      const expectedTotalForTwoWeeks = multiplyBigInts(expectedWeeklyAmount, 2);
      console.log("Expected total for 2 weeks:", formatTokenAmount(expectedTotalForTwoWeeks), "tokens");
      
      // Toplam miktarın, beklenen miktara yakın olduğunu doğrula
      const lowerBound = multiplyBigInts(expectedWeeklyAmount, 1);
      const upperBound = multiplyBigInts(expectedWeeklyAmount, 3);
      
      expect(isGreaterThan(balanceAfterWeek2.toString(), lowerBound)).to.be.true;
      expect(isGreaterThan(upperBound, balanceAfterWeek2.toString())).to.be.true;
    });
  });
  
  describe("2. Cliff ve Farklı Periyot Kombinasyonları", function() {
    it("2.1 Cliff süresi + haftalık periyot - İlk claim cliff'in bitmesini beklemeli", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      console.log("Current timestamp:", startTime);
      
      // User3 için cliff + haftalık release vesting oluştur
      await vestingContract.addClaimer(
        user3.address,
        USER3_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        CLIFF_DURATION, // 10 günlük cliff
        WEEKLY_RELEASE // Haftalık release
      );
      
      console.log(`Vesting created for User3: ${formatTokenAmount(USER3_AMOUNT)} tokens, 10-day cliff + weekly release`);
      
      // Cliff ortasında claim edilebilir miktar 0 olmalı
      await network.provider.send("evm_increaseTime", [Math.floor(CLIFF_DURATION / 2)]);
      await network.provider.send("evm_mine");
      
      const midCliffClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("Mid-cliff claimable (should be 0):", formatTokenAmount(midCliffClaimable.toString()), "tokens");
      expect(midCliffClaimable.toString()).to.equal("0");
      
      // Cliff'in hemen sonrası
      await network.provider.send("evm_increaseTime", [Math.floor(CLIFF_DURATION / 2) + 1]);
      await network.provider.send("evm_mine");
      
      // Cliff bitince claim edilebilir miktar olmalı (geçen zamanın oranına göre)
      const postCliffClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("Post-cliff claimable:", formatTokenAmount(postCliffClaimable.toString()), "tokens");
      expect(isGreaterThan(postCliffClaimable.toString(), "0")).to.be.true;
      
      // Claim işlemi
      await vestingContract.connect(user3).claim();
      const balanceAfterCliff = await mockToken.balanceOf(user3.address);
      console.log("User3 balance after cliff:", formatTokenAmount(balanceAfterCliff.toString()), "tokens");
      
      // Sonraki periyot (haftalık) tamamlanana kadar ilerlet
      // Cliff bittikten sonra, en az 7 gün geçmesi gerekiyor yeni token açılması için
      await network.provider.send("evm_increaseTime", [ONE_WEEK]);
      await network.provider.send("evm_mine");
      
      const nextPeriodClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("Next period claimable:", formatTokenAmount(nextPeriodClaimable.toString()), "tokens");
      expect(isGreaterThan(nextPeriodClaimable.toString(), "0")).to.be.true;
      
      // Claim işlemi
      await vestingContract.connect(user3).claim();
      const balanceAfterNextPeriod = await mockToken.balanceOf(user3.address);
      console.log("User3 balance after next period:", formatTokenAmount(balanceAfterNextPeriod.toString()), "tokens");
      
      // İkinci claim sonrası bakiye, ilk claim'den büyük olmalı
      expect(isGreaterThan(balanceAfterNextPeriod.toString(), balanceAfterCliff.toString())).to.be.true;
    });
    
    it("2.2 Çoklu kullanıcı ve farklı periyotlar - Aynı anda farklı claim oranları", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      console.log("Current timestamp:", startTime);
      
      // User1: Günlük periyot, cliff yok
      await vestingContract.addClaimer(
        user1.address,
        USER1_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        DAILY_RELEASE // Günlük release
      );
      
      // User2: Haftalık periyot, cliff yok
      await vestingContract.addClaimer(
        user2.address,
        USER2_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        WEEKLY_RELEASE // Haftalık release
      );
      
      // User3: İki haftalık periyot, cliff var
      await vestingContract.addClaimer(
        user3.address,
        USER3_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        CLIFF_DURATION, // 10 günlük cliff
        BIWEEKLY_RELEASE // İki haftalık release
      );
      
      console.log("Created vesting schedules for multiple users with different parameters");
      
      // 5 gün sonra
      await network.provider.send("evm_increaseTime", [ONE_DAY * 5]);
      await network.provider.send("evm_mine");
      
      // User1: Günlük periyot ile claim yapabilmeli
      const user1Claimable = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("User1 claimable after 5 days:", formatTokenAmount(user1Claimable.toString()), "tokens");
      expect(isGreaterThan(user1Claimable.toString(), "0")).to.be.true;
      
      // User2: Haftalık periyot tamamlanmadığı için 0 token
      const user2Claimable = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("User2 claimable after 5 days:", formatTokenAmount(user2Claimable.toString()), "tokens");
      expect(user2Claimable.toString()).to.equal("0");
      
      // User3: Cliff süresi tamamlanmadığı için 0 token
      const user3Claimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("User3 claimable after 5 days:", formatTokenAmount(user3Claimable.toString()), "tokens");
      expect(user3Claimable.toString()).to.equal("0");
      
      // Tüm kullanıcılar için claim yap (bir kısmı 0 olacak)
      await vestingContract.connect(user1).claim();
      // User2 ve User3 için claim miktarı 0 olduğundan revert olacak, onları şimdilik atlıyoruz
      
      // 7 gün daha ilerlet (toplam 12 gün)
      await network.provider.send("evm_increaseTime", [ONE_DAY * 7]);
      await network.provider.send("evm_mine");
      
      // User1: Günlük periyot ile claim yapabilmeli
      const user1Claimable2 = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("User1 claimable after 12 days:", formatTokenAmount(user1Claimable2.toString()), "tokens");
      
      // User2: Haftalık periyot tamamlandığı için claim yapabilmeli
      const user2Claimable2 = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("User2 claimable after 12 days:", formatTokenAmount(user2Claimable2.toString()), "tokens");
      expect(isGreaterThan(user2Claimable2.toString(), "0")).to.be.true;
      
      // User3: Cliff süresi tamamlandığı, ancak iki hafta dolmadığı için 0 token
      const user3Claimable2 = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("User3 claimable after 12 days:", formatTokenAmount(user3Claimable2.toString()), "tokens");
      
      // Sadece claim edilebilir miktarı olan kullanıcılar için claim yap
      await vestingContract.connect(user1).claim();
      
      if (isGreaterThan(user2Claimable2.toString(), "0")) {
        await vestingContract.connect(user2).claim();
      }
      
      if (isGreaterThan(user3Claimable2.toString(), "0")) {
        await vestingContract.connect(user3).claim();
      }
      
      // Son bakiyeleri kontrol et
      const user1Balance = await mockToken.balanceOf(user1.address);
      const user2Balance = await mockToken.balanceOf(user2.address);
      const user3Balance = await mockToken.balanceOf(user3.address);
      
      console.log("\nFinal balances:");
      console.log("User1 (daily release):", formatTokenAmount(user1Balance.toString()), "tokens");
      console.log("User2 (weekly release):", formatTokenAmount(user2Balance.toString()), "tokens");
      console.log("User3 (biweekly w/ cliff):", formatTokenAmount(user3Balance.toString()), "tokens");
    });
  });
  
  describe("3. Vesting Tamamlanma ve İptal Senaryoları", function() {
    it("3.1 Vesting tamamen tamamlandığında - Tüm tokenlerin açılması", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      // User1 için vesting
      await vestingContract.addClaimer(
        user1.address,
        USER1_AMOUNT,
        startTime,
        startTime + VESTING_DURATION, 
        CLIFF_DURATION,
        DAILY_RELEASE
      );
      
      // Tüm vesting süresinden daha fazla ilerlet
      await network.provider.send("evm_increaseTime", [VESTING_DURATION + ONE_DAY]);
      await network.provider.send("evm_mine");
      
      // Tüm token'ların claim edilebilir olduğunu doğrula
      const claimableAmount = await vestingContract.calculateClaimableAmount(user1.address);
      console.log("Claimable at vesting end:", formatTokenAmount(claimableAmount.toString()), "tokens");
      expect(claimableAmount.toString()).to.equal(USER1_AMOUNT);
      
      // Claim yap
      await vestingContract.connect(user1).claim();
      
      // Tüm miktarın alındığını doğrula
      const balance = await mockToken.balanceOf(user1.address);
      console.log("User1 final balance:", formatTokenAmount(balance.toString()), "tokens");
      expect(balance.toString()).to.equal(USER1_AMOUNT);
      
      // Artık claim edilecek bir şey kalmadığını doğrula
      const newClaimable = await vestingContract.calculateClaimableAmount(user1.address);
      expect(newClaimable.toString()).to.equal("0");
    });
    
    it("3.2 İptal durumundaki davranış - Son claim ve iptal sonrası davranış", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      // User2 için vesting
      await vestingContract.addClaimer(
        user2.address,
        USER2_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        WEEKLY_RELEASE
      );
      
      // 2 hafta ilerlet
      await network.provider.send("evm_increaseTime", [ONE_WEEK * 2]);
      await network.provider.send("evm_mine");
      
      // İptal öncesi claim edilebilir miktarı kontrol et
      const claimableBeforeRevoke = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Claimable before revoke:", formatTokenAmount(claimableBeforeRevoke.toString()), "tokens");
      expect(isGreaterThan(claimableBeforeRevoke.toString(), "0")).to.be.true;
      
      // İptal öncesi son bir claim yap
      await vestingContract.connect(user2).claim();
      const balanceBeforeRevoke = await mockToken.balanceOf(user2.address);
      console.log("User2 balance before revoke:", formatTokenAmount(balanceBeforeRevoke.toString()), "tokens");
      
      // Vesting'i iptal et
      await vestingContract.revokeVesting(user2.address);
      console.log("Vesting has been revoked for User2");
      
      // İptal sonrası claim edilebilir miktar 0 olmalı
      const claimableAfterRevoke = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Claimable after revoke:", formatTokenAmount(claimableAfterRevoke.toString()), "tokens");
      expect(claimableAfterRevoke.toString()).to.equal("0");
      
      // Zaman ilerletilse bile claim edilebilir miktar 0 olmalı
      await network.provider.send("evm_increaseTime", [ONE_WEEK * 2]);
      await network.provider.send("evm_mine");
      
      const claimableAfterMoreTime = await vestingContract.calculateClaimableAmount(user2.address);
      console.log("Claimable after more time:", formatTokenAmount(claimableAfterMoreTime.toString()), "tokens");
      expect(claimableAfterMoreTime.toString()).to.equal("0");
      
      // İptal sonrası claim yapmaya çalışma
      await expect(vestingContract.connect(user2).claim())
        .to.be.revertedWith("No tokens available to claim");
        
      // Final bakiye, iptal öncesindeki bakiye ile aynı olmalı
      const finalBalance = await mockToken.balanceOf(user2.address);
      console.log("User2 final balance:", formatTokenAmount(finalBalance.toString()), "tokens");
      expect(finalBalance.toString()).to.equal(balanceBeforeRevoke.toString());
    });
    
    it("3.3 Vesting iptal edilip yeniden eklenme - İptal sonrası yeni vesting", async function() {
      // Şimdiki zamanı al
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const startTime = blockBefore.timestamp;
      
      // User3 için vesting
      await vestingContract.addClaimer(
        user3.address,
        USER3_AMOUNT,
        startTime,
        startTime + VESTING_DURATION,
        0, // Cliff yok
        DAILY_RELEASE
      );
      
      // 10 gün ilerlet
      await network.provider.send("evm_increaseTime", [ONE_DAY * 10]);
      await network.provider.send("evm_mine");
      
      // İlk claim
      const firstClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("First claimable amount:", formatTokenAmount(firstClaimable.toString()), "tokens");
      
      await vestingContract.connect(user3).claim();
      const balanceAfterFirstClaim = await mockToken.balanceOf(user3.address);
      console.log("User3 balance after first claim:", formatTokenAmount(balanceAfterFirstClaim.toString()), "tokens");
      
      // Vesting'i iptal et
      await vestingContract.revokeVesting(user3.address);
      console.log("Vesting has been revoked for User3");
      
      // Yeni vesting ekle (daha düşük miktar ve haftalık periyot)
      const newAmount = USER1_AMOUNT; // 1,000 token (önceki 5,000'den düşük)
      
      // Şimdiki zamanı tekrar al
      const newBlockNum = await ethers.provider.getBlockNumber();
      const newBlock = await ethers.provider.getBlock(newBlockNum);
      const newStartTime = newBlock.timestamp;
      
      await vestingContract.addClaimer(
        user3.address,
        newAmount,
        newStartTime,
        newStartTime + VESTING_DURATION,
        0, // Cliff yok
        WEEKLY_RELEASE // Öncekinden farklı: haftalık
      );
      
      console.log(`New vesting created for User3: ${formatTokenAmount(newAmount)} tokens, weekly release`);
      
      // Claim edilebilir miktar 0 olmalı (haftalık periyot tamamlanmadı)
      const newInitialClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("New initial claimable:", formatTokenAmount(newInitialClaimable.toString()), "tokens");
      expect(newInitialClaimable.toString()).to.equal("0");
      
      // 1 hafta ilerlet
      await network.provider.send("evm_increaseTime", [ONE_WEEK]);
      await network.provider.send("evm_mine");
      
      // Şimdi claim edilebilir miktar olmalı
      const newClaimable = await vestingContract.calculateClaimableAmount(user3.address);
      console.log("New claimable after 1 week:", formatTokenAmount(newClaimable.toString()), "tokens");
      expect(isGreaterThan(newClaimable.toString(), "0")).to.be.true;
      
      // Claim işlemi
      await vestingContract.connect(user3).claim();
      
      // Final bakiye, ilk claim + yeni claim toplamı olmalı
      const finalBalance = await mockToken.balanceOf(user3.address);
      console.log("User3 final balance:", formatTokenAmount(finalBalance.toString()), "tokens");
      expect(isGreaterThan(finalBalance.toString(), balanceAfterFirstClaim.toString())).to.be.true;
    });
  });
});