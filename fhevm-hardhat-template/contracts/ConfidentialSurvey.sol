// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ConfidentialSurvey is SepoliaConfig {
    // -----------------------------------------------------------------
    //  CẤU TRÚC DỮ LIỆU
    // -----------------------------------------------------------------
    struct Survey {
        address owner;
        string restaurantName;
        bool isActive;
        euint64 qualitySum;
        euint64 priceSum;
        euint64 ambianceSum;
        euint64 responseCount;
    }

    // -----------------------------------------------------------------
    //  STATE
    // -----------------------------------------------------------------
    uint256 public currentSurveyId;
    mapping(uint256 => Survey) public surveys;

    mapping(uint256 => mapping(address => bool)) public hasSubmitted;
    mapping(uint256 => mapping(address => euint64)) public qualityRatings;
    mapping(uint256 => mapping(address => euint64)) public priceRatings;
    mapping(uint256 => mapping(address => euint64)) public ambianceRatings;

    mapping(uint256 => uint256) private decryptionToSurveyId;
    uint256 private decryptionRequestIdResults;

    // -----------------------------------------------------------------
    //  EVENTS
    // -----------------------------------------------------------------
    event SurveyStarted(uint256 indexed surveyId, address indexed owner, string restaurantName);
    event RatingSubmitted(address indexed user, uint256 indexed surveyId, uint256 requestId);
    event SurveyEnded(uint256 indexed surveyId, address indexed owner, uint256 requestId);
    event ResultsDecrypted(
        uint256 indexed surveyId,
        address indexed owner,
        string restaurantName,
        uint64 qualityAvg,
        uint64 priceAvg,
        uint64 ambianceAvg,
        uint64 responseCount
    );

    // -----------------------------------------------------------------
    //  MODIFIERS
    // -----------------------------------------------------------------
    modifier onlySurveyOwner(uint256 surveyId) {
        require(msg.sender == surveys[surveyId].owner, "Only survey owner");
        _;
    }

    modifier surveyActive(uint256 surveyId) {
        require(surveys[surveyId].isActive, "Survey not active");
        _;
    }

    // -----------------------------------------------------------------
    //  CONSTRUCTOR
    // -----------------------------------------------------------------
    constructor() {
        currentSurveyId = 0;
    }

    // -----------------------------------------------------------------
    //  PUBLIC: BẮT ĐẦU SURVEY
    // -----------------------------------------------------------------
    function startSurvey(string calldata restaurantName) external {
        currentSurveyId += 1;
        uint256 surveyId = currentSurveyId;

        Survey storage s = surveys[surveyId];
        s.owner = msg.sender;
        s.restaurantName = restaurantName;
        s.isActive = true;

        // Khởi tạo các tổng = 0 (ciphertext)
        s.qualitySum   = FHE.asEuint64(0);
        s.priceSum     = FHE.asEuint64(0);
        s.ambianceSum  = FHE.asEuint64(0);
        s.responseCount = FHE.asEuint64(0);

        FHE.allowThis(s.qualitySum);
        FHE.allowThis(s.priceSum);
        FHE.allowThis(s.ambianceSum);
        FHE.allowThis(s.responseCount);

        emit SurveyStarted(surveyId, msg.sender, restaurantName);
    }

    // -----------------------------------------------------------------
    //  USER: GỬI ĐÁNH GIÁ
    // -----------------------------------------------------------------
    function submitRating(
        uint256 surveyId,
        externalEuint64 encryptedQuality,
        externalEuint64 encryptedPrice,
        externalEuint64 encryptedAmbiance,
        bytes calldata qualityProof,
        bytes calldata priceProof,
        bytes calldata ambianceProof
    ) external surveyActive(surveyId) {
        require(!hasSubmitted[surveyId][msg.sender], "Already submitted");

        Survey storage s = surveys[surveyId];

        euint64 quality   = FHE.fromExternal(encryptedQuality,   qualityProof);
        euint64 price     = FHE.fromExternal(encryptedPrice,     priceProof);
        euint64 ambiance  = FHE.fromExternal(encryptedAmbiance, ambianceProof);

        // ---- Validate 1‑10 (FHE) ----
        ebool qOk = FHE.and(FHE.ge(quality,   FHE.asEuint64(1)), FHE.le(quality,   FHE.asEuint64(10)));
        ebool pOk = FHE.and(FHE.ge(price,     FHE.asEuint64(1)), FHE.le(price,     FHE.asEuint64(10)));
        ebool aOk = FHE.and(FHE.ge(ambiance,  FHE.asEuint64(1)), FHE.le(ambiance,  FHE.asEuint64(10)));

        euint64 safeQ = FHE.select(qOk, quality,  FHE.asEuint64(0));
        euint64 safeP = FHE.select(pOk, price,    FHE.asEuint64(0));
        euint64 safeA = FHE.select(aOk, ambiance, FHE.asEuint64(0));

        // ---- Lưu đánh giá cá nhân ----
        qualityRatings[surveyId][msg.sender] = safeQ;
        priceRatings[surveyId][msg.sender]   = safeP;
        ambianceRatings[surveyId][msg.sender]= safeA;
        FHE.allowThis(qualityRatings[surveyId][msg.sender]);
        FHE.allowThis(priceRatings[surveyId][msg.sender]);
        FHE.allowThis(ambianceRatings[surveyId][msg.sender]);

        // ---- Cộng dồn ----
        ebool anyValid = FHE.or(FHE.or(qOk, pOk), aOk);
        s.qualitySum   = FHE.add(s.qualitySum,   safeQ);
        s.priceSum     = FHE.add(s.priceSum,     safeP);
        s.ambianceSum  = FHE.add(s.ambianceSum,  safeA);
        s.responseCount = FHE.add(s.responseCount,
            FHE.select(anyValid, FHE.asEuint64(1), FHE.asEuint64(0)));

        FHE.allowThis(s.qualitySum);
        FHE.allowThis(s.priceSum);
        FHE.allowThis(s.ambianceSum);
        FHE.allowThis(s.responseCount);

        hasSubmitted[surveyId][msg.sender] = true;

        // ---- Kiểm tra nhanh (tùy chọn) ----
        bytes32[] memory cts = new bytes32[](3);
        cts[0] = FHE.toBytes32(safeQ);
        cts[1] = FHE.toBytes32(safeP);
        cts[2] = FHE.toBytes32(safeA);
        uint256 reqId = FHE.requestDecryption(cts, this.callbackVerifyRating.selector);
        decryptionToSurveyId[reqId] = surveyId;

        emit RatingSubmitted(msg.sender, surveyId, reqId);
    }

    // -----------------------------------------------------------------
    //  CALLBACK: KIỂM TRA ĐÁNH GIÁ
    // -----------------------------------------------------------------
    function callbackVerifyRating(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);
        (uint64 q, uint64 p, uint64 a) = abi.decode(cleartexts, (uint64, uint64, uint64));
        require(q == 0 || (q >= 1 && q <= 10), "Invalid quality");
        require(p == 0 || (p >= 1 && p <= 10), "Invalid price");
        require(a == 0 || (a >= 1 && a <= 10), "Invalid ambiance");
        delete decryptionToSurveyId[requestId];
    }

    // -----------------------------------------------------------------
    //  OWNER: KẾT THÚC SURVEY
    // -----------------------------------------------------------------
    function endSurvey(uint256 surveyId) external onlySurveyOwner(surveyId) surveyActive(surveyId) {
        Survey storage s = surveys[surveyId];
        s.isActive = false;

        bytes32[] memory cts = new bytes32[](4);
        cts[0] = FHE.toBytes32(s.qualitySum);
        cts[1] = FHE.toBytes32(s.priceSum);
        cts[2] = FHE.toBytes32(s.ambianceSum);
        cts[3] = FHE.toBytes32(s.responseCount);

        decryptionRequestIdResults = FHE.requestDecryption(cts, this.callbackSurveyResults.selector);
        decryptionToSurveyId[decryptionRequestIdResults] = surveyId;

        emit SurveyEnded(surveyId, msg.sender, decryptionRequestIdResults);
    }

    // -----------------------------------------------------------------
    //  CALLBACK: HIỂN THỊ KẾT QUẢ + RESET (ĐÃ SỬA)
    // -----------------------------------------------------------------
    function callbackSurveyResults(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);
        require(requestId == decryptionRequestIdResults, "Invalid request ID");

        uint256 surveyId = decryptionToSurveyId[requestId];
        Survey storage s = surveys[surveyId];

        // LƯU TÊN QUÁN TRƯỚC KHI RESET
        string memory restaurantName = s.restaurantName;

        (uint64 qTot, uint64 pTot, uint64 aTot, uint64 cnt) =
            abi.decode(cleartexts, (uint64, uint64, uint64, uint64));

        uint64 qAvg = cnt > 0 ? qTot / cnt : 0;
        uint64 pAvg = cnt > 0 ? pTot / cnt : 0;
        uint64 aAvg = cnt > 0 ? aTot / cnt : 0;

        // EMIT VỚI TÊN ĐÚNG
        emit ResultsDecrypted(
            surveyId,
            s.owner,
            restaurantName,
            qAvg,
            pAvg,
            aAvg,
            cnt
        );

        // RESET SAU KHI EMIT
        s.qualitySum   = FHE.asEuint64(0);
        s.priceSum     = FHE.asEuint64(0);
        s.ambianceSum  = FHE.asEuint64(0);
        s.responseCount = FHE.asEuint64(0);

        FHE.allowThis(s.qualitySum);
        FHE.allowThis(s.priceSum);
        FHE.allowThis(s.ambianceSum);
        FHE.allowThis(s.responseCount);

        delete decryptionToSurveyId[requestId];
        decryptionRequestIdResults = 0;
    }

    // -----------------------------------------------------------------
    //  VIEW HELPERS
    // -----------------------------------------------------------------
    function getCurrentSurveyId() external view returns (uint256) {
        return currentSurveyId;
    }

    function isSurveyActive(uint256 surveyId) external view returns (bool) {
        return surveys[surveyId].isActive;
    }

    function getSurveyInfo(uint256 surveyId)
        external
        view
        returns (address owner, string memory restaurantName, bool isActive)
    {
        Survey storage s = surveys[surveyId];
        return (s.owner, s.restaurantName, s.isActive);
    }

    function getHasSubmitted(uint256 surveyId, address user) external view returns (bool) {
        return hasSubmitted[surveyId][user];
    }
}