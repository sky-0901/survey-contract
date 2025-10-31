Confidential Survey with FHEVM - README

This project implements a Confidential Survey System using the Fully Homomorphic Encryption Virtual Machine (FHEVM). It allows users to submit encrypted restaurant ratings (quality, price, ambiance) while preserving privacy. The survey owner manages survey creation and result aggregation, and decryption is performed only when revealing the final averages.

📘 Overview

The ConfidentialSurvey smart contract is deployed on an FHEVM-compatible blockchain (e.g., Zama Sepolia testnet). It enables privacy-preserving surveys where:

Ratings are encrypted with FHE, keeping individual feedback confidential.

The contract aggregates encrypted data without decryption.

The survey owner can later decrypt aggregated results to view average scores securely.

A React + TypeScript frontend integrates with MetaMask and ethers.js for seamless user interaction.

🔑 Features

Encrypted Ratings: All responses are fully encrypted using FHE.

Owner Controls: Start, close, and decrypt survey results securely.

User Actions: Submit encrypted ratings for quality, price, and ambiance.

Secure Aggregation: Calculations are done on encrypted data—no raw data exposure.

Clean UI: Built with React for an intuitive user experience.

⚙️ Prerequisites

Node.js ≥ 18

MetaMask connected to Zama Sepolia

Yarn/NPM for dependency management

FHEVM Environment configured and accessible

Testnet ETH for gas fees

🚀 Setup Instructions

1. Clone the repository:

git clone <repository-url>
cd confidential-survey


2. Install dependencies:

yarn install
# or
npm install


3. Configure environment:
Ensure MetaMask is connected to the correct FHEVM network and update ConfidentialSurveyAddresses.ts with your deployed contract address.

4. Run the app:

yarn start
# or
npm start


Access at http://localhost:3000
.

🧩 Usage

For Survey Owners:

Create a new survey with a restaurant name.

View encrypted results and request decryption once enough responses are collected.

For Users:

Submit encrypted ratings (quality, price, ambiance).

Your responses remain private, even from the survey owner.

💡 Smart Contract Details

Main Functions:

createSurvey(string restaurantName) – Create a new confidential survey.

submitEncryptedRatings(euint64 quality, euint64 price, euint64 ambiance) – Submit encrypted ratings.

decryptSurveyResults() – Decrypt aggregated data for average results.

Events:

SurveyCreated – New survey launched.

SurveySubmitted – New response recorded.

SurveyDecrypted – Final results revealed.

🖥️ Frontend Details

Built with React, TypeScript, and ethers.js.

Integrates fhevm for encryption/decryption.

Uses hooks for MetaMask and survey state management.

🧭 Troubleshooting

MetaMask Issues: Ensure MetaMask is unlocked and on the correct network.

FHEVM Errors: Check fhevm initialization and network compatibility.

Transaction Failures: Ensure sufficient gas and verify contract address.
