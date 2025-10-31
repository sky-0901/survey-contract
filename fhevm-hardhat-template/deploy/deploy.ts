import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedConfidentialSurvey = await  deploy("ConfidentialSurvey", {
    from: deployer,
    log: true,
  });
  

  console.log(`ConfidentialSurvey contract: `, deployedConfidentialSurvey.address);
 
};
export default func;
func.id = "deploy"; // id required to prevent reexecution
func.tags = ["ConfidentialSurvey"];
