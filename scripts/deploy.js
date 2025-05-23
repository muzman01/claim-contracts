// deploy.js (Fixed for Hardhat v6+ with Ownership Check)
const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying TokenVestingDeployer to BSC Testnet...\n");
  
  const [signer] = await hre.ethers.getSigners();
  console.log("📱 Deployer (Your PK):", signer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(await signer.provider.getBalance(signer.address)), "BNB\n"); // ✅ FIX

  // TokenVestingDeployer'ı deploy et
  const TokenVestingDeployer = await hre.ethers.getContractFactory("TokenVestingDeployer");
  const deployer = await TokenVestingDeployer.deploy();

  // Yeni syntax: waitForDeployment() kullan
  await deployer.waitForDeployment();

  // Contract address'i al
  const deployerAddress = await deployer.getAddress();
  console.log("✅ TokenVestingDeployer deployed to:", deployerAddress);

  // Factory ve implementation adreslerini al
  const factoryAddress = await deployer.factory();
  const implementationAddress = await deployer.implementation();

  console.log("✅ Factory deployed to:", factoryAddress);
  console.log("✅ Implementation deployed to:", implementationAddress);

  // ✅ EKLE: Ownership kontrolü
  console.log("\n🔍 Ownership Verification:");
  try {
    // Factory contract'ını al
    const factory = await hre.ethers.getContractAt("TokenVestingFactory", factoryAddress);
    
    // Owner'ları kontrol et
    const factoryOwner = await factory.owner();
    const deployerContractDeployer = await deployer.deployer();
    
    console.log("Factory Owner:", factoryOwner);
    console.log("Your Address:", signer.address);
    console.log("Deployer Contract Deployer:", deployerContractDeployer);
    console.log("✅ You are Factory Owner:", factoryOwner.toLowerCase() === signer.address.toLowerCase());
    console.log("✅ Deployer Match:", deployerContractDeployer.toLowerCase() === signer.address.toLowerCase());
    
    // Eğer ownership doğru değilse uyar
    if (factoryOwner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log("\n⚠️  WARNING: You are not the factory owner!");
      console.log("🔧 Try calling: deployer.transferFactoryOwnership(yourAddress)");
    } else {
      console.log("\n🎉 SUCCESS: You are the factory owner!");
    }
    
    // Factory info test et
    const vestingImpl = await factory.vestingImplementation();
    const contractsCount = await factory.getVestingContractsCount();
    console.log("\n📋 Factory Info:");
    console.log("Vesting Implementation:", vestingImpl);
    console.log("Contracts Count:", contractsCount.toString());
    
  } catch (error) {
    console.log("❌ Ownership check failed:", error.message);
  }

  // Kontrat doğrulamaları için
  console.log("\n📝 Verification commands:");
  console.log(`npx hardhat verify --network bscTestnet ${deployerAddress}`);
  console.log(`npx hardhat verify --network bscTestnet ${factoryAddress} ${implementationAddress}`);
  console.log(`npx hardhat verify --network bscTestnet ${implementationAddress}`);

  console.log("\n✅ Deploy işlemi tamamlandı!");

  // Deployment bilgilerini kaydet
  const factory = await hre.ethers.getContractAt("TokenVestingFactory", factoryAddress);
  const factoryOwner = await factory.owner();
  
  const deploymentInfo = {
    network: "bscTestnet",
    deployer: deployerAddress,
    factory: factoryAddress,
    implementation: implementationAddress,
    signer: signer.address, // ✅ EKLE: Gerçek deployer adresi
    factoryOwner: factoryOwner, // ✅ EKLE: Factory owner
    timestamp: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber()
  };

  console.log("\n📊 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  // ✅ EKLE: Frontend config
  console.log("\n🔧 Frontend Config Update:");
  console.log(`vestingFactory: '${factoryAddress}',`);
  console.log(`vestingImplementation: '${implementationAddress}',`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });