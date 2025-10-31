// src/hooks/useConfidentialSurvey.tsx
"use client";

import { ethers } from "ethers";
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FhevmInstance } from "@/fhevm/fhevmTypes";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { ConfidentialSurveyAddresses } from "@/abi/ConfidentialSurveyAddresses";
import { ConfidentialSurveyABI } from "@/abi/ConfidentialSurveyABI";

type ConfidentialSurveyInfoType = {
  abi: typeof ConfidentialSurveyABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

function getConfidentialSurveyByChainId(chainId: number | undefined): ConfidentialSurveyInfoType {
  if (!chainId) return { abi: ConfidentialSurveyABI.abi };
  const chainIdStr = chainId.toString() as keyof typeof ConfidentialSurveyAddresses;
  const entry = ConfidentialSurveyAddresses[chainIdStr];
  if (!entry || entry.address === ethers.ZeroAddress) {
    return { abi: ConfidentialSurveyABI.abi, chainId };
  }
  return {
    address: entry.address as `0x${string}`,
    chainId: entry.chainId ?? chainId,
    chainName: entry.chainName,
    abi: ConfidentialSurveyABI.abi,
  };
}

export const useConfidentialSurvey = (parameters: {
  instance: FhevmInstance | undefined;
  fhevmDecryptionSignatureStorage: GenericStringStorage;
  eip1193Provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  ethersSigner: ethers.JsonRpcSigner | undefined;
  ethersReadonlyProvider: ethers.ContractRunner | undefined;
  sameChain: RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: RefObject<(ethersSigner: ethers.JsonRpcSigner | undefined) => boolean>;
}) => {
  const {
    instance,
    eip1193Provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  } = parameters;

  // === STATE ===
  const [currentSurveyId, setCurrentSurveyId] = useState<number>(0);
  const [surveyHistory, setSurveyHistory] = useState<Array<{
    id: number;
    owner: string;
    restaurantName: string;
    isActive: boolean;
    submitted: boolean;
    results?: {
      qualityAvg: number;
      priceAvg: number;
      ambianceAvg: number;
      responseCount: number;
    };
  }>>([]);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isStartingSurvey, setIsStartingSurvey] = useState<boolean>(false);
  const [isSubmittingRatings, setIsSubmittingRatings] = useState<boolean>(false);
  const [isEndingSurvey, setIsEndingSurvey] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const confidentialSurveyRef = useRef<ConfidentialSurveyInfoType | undefined>(undefined);
  const isRefreshingRef = useRef(isRefreshing);
  const isStartingSurveyRef = useRef(isStartingSurvey);
  const isSubmittingRatingsRef = useRef(isSubmittingRatings);
  const isEndingSurveyRef = useRef(isEndingSurvey);

  const confidentialSurvey = useMemo(() => {
    const c = getConfidentialSurveyByChainId(chainId);
    confidentialSurveyRef.current = c;
    if (!c.address) setMessage(`Contract not deployed on chainId=${chainId}`);
    return c;
  }, [chainId]);

  const isDeployed = useMemo(() => {
    return Boolean(confidentialSurvey.address) && confidentialSurvey.address !== ethers.ZeroAddress;
  }, [confidentialSurvey]);

  // === CONTRACT ===
  const contract = useMemo(() => {
    if (!confidentialSurvey.address || !ethersReadonlyProvider) return null;
    return new ethers.Contract(confidentialSurvey.address, confidentialSurvey.abi, ethersReadonlyProvider);
  }, [confidentialSurvey.address, ethersReadonlyProvider]);

  const signerContract = useMemo(() => {
    if (!confidentialSurvey.address || !ethersSigner) return null;
    return new ethers.Contract(confidentialSurvey.address, confidentialSurvey.abi, ethersSigner);
  }, [confidentialSurvey.address, ethersSigner]);

  // === REFRESH STATE ===
  const refreshState = useCallback(async () => {
    if (isRefreshingRef.current || !contract || !ethersSigner) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setMessage("Refreshing...");

    try {
      const [currentId, signerAddr] = await Promise.all([
        contract.getCurrentSurveyId(),
        ethersSigner.getAddress()
      ]);

      const history = [];
      for (let id = 1; id <= Number(currentId); id++) {
        try {
          const [info, submitted] = await Promise.all([
            contract.getSurveyInfo(id),
            contract.getHasSubmitted(id, signerAddr).catch(() => false)
          ]);
          history.push({
            id,
            owner: info[0],
            restaurantName: info[1],
            isActive: info[2],
            submitted
          });
        } catch {
        
        }
      }

      setCurrentSurveyId(Number(currentId));
      setSurveyHistory(history);
      const activeOwner = history.find(s => s.isActive)?.owner.toLowerCase();
      setIsOwner(activeOwner ? activeOwner === signerAddr.toLowerCase() : false);
      setMessage("Refreshed");
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [contract, ethersSigner]);

  // === LISTEN ResultsDecrypted ===
  useEffect(() => {
    if (!contract) return;

    const filter = contract.filters.ResultsDecrypted();
    const listener = (...args: any[]) => {
      
      const eventLog = args[args.length - 1];
      if (eventLog && typeof eventLog === 'object' && 'log' in eventLog) {
        args.pop();
      }

      console.log("ResultsDecrypted raw args:", args);

      if (args.length !== 7) {
        console.error("Invalid ResultsDecrypted args count:", args.length, args);
        return;
      }

      const [
        surveyId,
        owner,
        restaurantName,
        qualityAvg,
        priceAvg,
        ambianceAvg,
        responseCount
      ] = args;

      const id = Number(surveyId);
      setSurveyHistory(prev =>
        prev.map(s =>
          s.id === id
            ? {
                ...s,
                isActive: false,
                results: {
                  qualityAvg: Number(qualityAvg),
                  priceAvg: Number(priceAvg),
                  ambianceAvg: Number(ambianceAvg),
                  responseCount: Number(responseCount),
                },
              }
            : s
        )
      );

      setMessage(`Kết quả "${restaurantName}" đã được giải mã!`);
    };

    contract.on(filter, listener);

    return () => {
      contract.off(filter, listener);
    };
  }, [contract]);

  // === AUTO REFRESH ===
  useEffect(() => {
    if (sameChain.current?.(chainId) && sameSigner.current?.(ethersSigner)) return;
    refreshState();
  }, [chainId, ethersSigner, sameChain, sameSigner, refreshState]);

  // === ACTIONS ===
  const startSurvey = useCallback(async (restaurantName: string) => {
    if (isStartingSurveyRef.current || !signerContract || !restaurantName.trim()) return;
    isStartingSurveyRef.current = true;
    setIsStartingSurvey(true);
    setMessage("Starting survey...");

    try {
      const tx = await signerContract.startSurvey(restaurantName);
      setMessage(`Tx: ${tx.hash}`);
      await tx.wait();
      setMessage("Survey started!");
      await refreshState();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      isStartingSurveyRef.current = false;
      setIsStartingSurvey(false);
    }
  }, [signerContract, refreshState]);

  const submitRatings = useCallback(async (surveyId: number, q: number, p: number, a: number) => {
    if (isSubmittingRatingsRef.current || !instance || !signerContract) return;
    if (q < 1 || q > 10 || p < 1 || p > 10 || a < 1 || a > 10) {
      setMessage("Ratings must be 1-10");
      return;
    }

    isSubmittingRatingsRef.current = true;
    setIsSubmittingRatings(true);
    setMessage("Encrypting...");

    const signerAddr = await ethersSigner!.getAddress();
    try {
      const encQ = await instance.createEncryptedInput(confidentialSurvey.address!, signerAddr).add64(q).encrypt();
      const encP = await instance.createEncryptedInput(confidentialSurvey.address!, signerAddr).add64(p).encrypt();
      const encA = await instance.createEncryptedInput(confidentialSurvey.address!, signerAddr).add64(a).encrypt();

      const tx = await signerContract.submitRating(
        surveyId,
        encQ.handles[0], encP.handles[0], encA.handles[0],
        encQ.inputProof, encP.inputProof, encA.inputProof
      );
      setMessage(`Tx: ${tx.hash}`);
      await tx.wait();
      setMessage("Submitted! Cảm ơn bạn!");
      await refreshState();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      isSubmittingRatingsRef.current = false;
      setIsSubmittingRatings(false);
    }
  }, [instance, ethersSigner, signerContract, confidentialSurvey.address, refreshState]);

  const endSurvey = useCallback(async (surveyId: number) => {
    if (isEndingSurveyRef.current || !signerContract) return;
    isEndingSurveyRef.current = true;
    setIsEndingSurvey(true);
    setMessage("Ending survey...");

    try {
      const tx = await signerContract.endSurvey(surveyId);
      setMessage(`Tx: ${tx.hash}`);
      await tx.wait();
      setMessage("Survey ended! Đang giải mã kết quả...");
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      isEndingSurveyRef.current = false;
      setIsEndingSurvey(false);
    }
  }, [signerContract]);

  // === CAN ACTIONS ===
  const canStartSurvey = isDeployed && ethersSigner && !isStartingSurvey && !isRefreshing;

  const canSubmitRatings = (surveyId: number) => {
    const s = surveyHistory.find(s => s.id === surveyId);
    return s?.isActive && !s.submitted && !isOwner && instance && ethersSigner && !isSubmittingRatings;
  };

  const canEndSurvey = async (surveyId: number) => {
    if (!ethersSigner) return false;
    const s = surveyHistory.find(s => s.id === surveyId);
    if (!s?.isActive) return false;
    try {
      const addr = await ethersSigner.getAddress();
      return s.owner.toLowerCase() === addr.toLowerCase() && !isEndingSurvey;
    } catch {
      return false;
    }
  };

  return {
    contractAddress: confidentialSurvey.address,
    currentSurveyId,
    surveyHistory,
    isOwner,
    canStartSurvey,
    canSubmitRatings,
    canEndSurvey,
    startSurvey,
    submitRatings,
    endSurvey,
    refreshState,
    message,
    isRefreshing,
    isStartingSurvey,
    isSubmittingRatings,
    isEndingSurvey,
    isDeployed,
  };
};