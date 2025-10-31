// src/components/ConfidentialSurveyDemo.tsx
"use client";

import { useFhevm } from "../fhevm/useFhevm";
import { useInMemoryStorage } from "../hooks/useInMemoryStorage";
import { useMetaMaskEthersSigner } from "../hooks/metamask/useMetaMaskEthersSigner";
import { useConfidentialSurvey } from "@/hooks/useConfidentialSurvey";
import { errorNotDeployed } from "./ErrorNotDeployed";
import { useState, useEffect } from "react";

export const ConfidentialSurveyDemo = () => {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const { provider, chainId, isConnected, connect, ethersSigner, ethersReadonlyProvider, sameChain, sameSigner, initialMockChains } = useMetaMaskEthersSigner();
  const { instance: fhevmInstance } = useFhevm({ provider, chainId, initialMockChains, enabled: true });
  const confidentialSurvey = useConfidentialSurvey({
    instance: fhevmInstance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider: provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  });

  const [restaurantName, setRestaurantName] = useState("");
  const [quality, setQuality] = useState(5);
  const [price, setPrice] = useState(5);
  const [ambiance, setAmbiance] = useState(5);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [canEnd, setCanEnd] = useState(false);

  const buttonClass = "px-4 py-2 bg-black text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed";
  const cardClass = "p-4 rounded-lg border-2 border-black bg-white";

  useEffect(() => {
    if (ethersSigner) {
      ethersSigner.getAddress().then(setOwnerAddress);
    }
  }, [ethersSigner]);

  const activeSurvey = confidentialSurvey.surveyHistory.find(s => s.isActive);
  const isOwner = ownerAddress && activeSurvey?.owner.toLowerCase() === ownerAddress.toLowerCase();

  useEffect(() => {
    if (activeSurvey && isOwner) {
      confidentialSurvey.canEndSurvey(activeSurvey.id).then(setCanEnd);
    } else {
      setCanEnd(false);
    }
  }, [activeSurvey, isOwner, confidentialSurvey]);

  if (!isConnected) {
    return (
      <div className="flex justify-center p-10">
        <button className={buttonClass + " text-xl px-8 py-4"} onClick={connect}>
          Connect MetaMask
        </button>
      </div>
    );
  }

  if (!confidentialSurvey.isDeployed) {
    return errorNotDeployed(chainId);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-center">Confidential Survey</h1>

      {/* Contract Info */}
      <div className={cardClass}>
        <h2 className="font-bold text-lg mb-2">Contract</h2>
        <p><strong>Chain ID:</strong> {chainId}</p>
        <p><strong>Address:</strong> <code className="text-xs">{confidentialSurvey.contractAddress}</code></p>
        <button className={buttonClass + " mt-2"} onClick={confidentialSurvey.refreshState} disabled={confidentialSurvey.isRefreshing}>
          {confidentialSurvey.isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Start New Survey */}
      <div className={cardClass}>
        <h2 className="font-bold text-lg mb-2">Start New Survey</h2>
        <input
          type="text"
          placeholder="Tên quán ăn"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          className="border border-gray-400 p-2 rounded w-full mb-2"
        />
        <button
          className={buttonClass}
          disabled={!confidentialSurvey.canStartSurvey || !restaurantName.trim()}
          onClick={() => confidentialSurvey.startSurvey(restaurantName)}
        >
          {confidentialSurvey.isStartingSurvey ? "Starting..." : "Start Survey"}
        </button>
      </div>

      {/* Active Survey */}
      {activeSurvey && (
        <div className={cardClass}>
          <h2 className="font-bold text-lg mb-2 text-blue-600">Active Survey: {activeSurvey.restaurantName}</h2>
          <p><strong>Owner:</strong> {activeSurvey.owner}</p>
          <p><strong>Survey ID:</strong> {activeSurvey.id}</p>

          {/* Owner Controls */}
          {isOwner && (
            <button
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => confidentialSurvey.endSurvey(activeSurvey.id)}
              disabled={!canEnd}
            >
              {confidentialSurvey.isEndingSurvey ? "Ending..." : "End Survey"}
            </button>
          )}

          {/* User Rating Form */}
          {!isOwner && (
            <div className="mt-4">
              <p className="font-medium mb-2">
                {activeSurvey.submitted ? (
                  <span className="text-green-600 font-bold">Bạn đã đánh giá rồi!</span>
                ) : (
                  "Đánh giá của bạn:"
                )}
              </p>
              {!activeSurvey.submitted && (
                <>
                  <div className="grid grid-cols-1 gap-2 mb-2">
                    <label>Quality:</label>
                    <input type="number" min="1" max="10" value={quality} onChange={e => setQuality(Number(e.target.value))} className="border p-1 text-center" placeholder="Chất lượng" />
                    <label>Price:</label>
                    <input type="number" min="1" max="10" value={price} onChange={e => setPrice(Number(e.target.value))} className="border p-1 text-center" placeholder="Giá cả" />
                    <label>Ambiance:</label>
                    <input type="number" min="1" max="10" value={ambiance} onChange={e => setAmbiance(Number(e.target.value))} className="border p-1 text-center" placeholder="Không gian" />
                  </div>
                  <button
                    className={buttonClass}
                    disabled={!confidentialSurvey.canSubmitRatings(activeSurvey.id)}
                    onClick={() => confidentialSurvey.submitRatings(activeSurvey.id, quality, price, ambiance)}
                  >
                    {confidentialSurvey.isSubmittingRatings ? "Submitting..." : "Submit"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Survey History */}
      <div className={cardClass}>
        <h2 className="font-bold text-lg mb-2">Survey History</h2>
        {confidentialSurvey.surveyHistory.length === 0 ? (
          <p className="text-gray-500">Chưa có survey nào.</p>
        ) : (
          <div className="space-y-3">
            {confidentialSurvey.surveyHistory.map(survey => (
              <div key={survey.id} className={`p-3 rounded border ${survey.isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                <p className="font-medium">{survey.restaurantName} (ID: {survey.id})</p>
                <p className="text-sm text-gray-600">Owner: {survey.owner.slice(0, 6)}...{survey.owner.slice(-4)}</p>
                <p className="text-sm">Trạng thái: {survey.isActive ? 'Đang mở' : 'Đã kết thúc'}</p>
                {survey.submitted && <p className="text-green-600 text-sm">Bạn đã đánh giá</p>}

                {survey.results && (
                  <div className="mt-2 p-2 bg-green-100 rounded">
                    <p className="font-medium">Kết quả:</p>
                    <p>Chất lượng: <strong>{survey.results.qualityAvg}/10</strong></p>
                    <p>Giá cả: <strong>{survey.results.priceAvg}/10</strong></p>
                    <p>Không gian: <strong>{survey.results.ambianceAvg}/10</strong></p>
                    <p>Số lượt: <strong>{survey.results.responseCount}</strong></p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="text-center text-sm text-gray-600">
        {confidentialSurvey.message}
      </div>
    </div>
  );
};
