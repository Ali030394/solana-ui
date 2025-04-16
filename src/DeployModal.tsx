import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, X, CheckCircle, Info, Search, ChevronRight, Settings, DollarSign, ArrowUp, ArrowDown, Upload, RefreshCw } from 'lucide-react';
import { getWallets } from './Utils';
import { useToast } from "./Notifications";
import { executePumpCreate, WalletForPumpCreate, TokenCreationConfig } from './utils/pumpcreate';

const STEPS_DEPLOY = ["Token Details", "Select Wallets", "Review"];
const MAX_WALLETS = 5; // Maximum number of wallets that can be selected

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DeployModalProps extends BaseModalProps {
  onDeploy: (data: any) => void;
  handleRefresh: () => void;
  solBalances: Map<string, number>;
}

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  onClose,
  onDeploy,
  handleRefresh,
  solBalances,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [mintPubkey, setMintPubkey] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tokenData, setTokenData] = useState({
    name: '',
    symbol: '',
    description: '',
    telegram: '',
    twitter: '',
    website: '',
    file: ''
  });
  const [walletAmounts, setWalletAmounts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showInfoTip, setShowInfoTip] = useState(false);
  const [sortOption, setSortOption] = useState('address');
  const [sortDirection, setSortDirection] = useState('asc');
  const [balanceFilter, setBalanceFilter] = useState('all');

  const generateMintPubkey = async () => {
    setIsGenerating(true);
    try {
      const baseUrl = (window as any).tradingServerUrl.replace(/\/+$/, '');
      const mintResponse = await fetch(`${baseUrl}/api/utilities/generate-mint`);
      const data = await mintResponse.json();
      setMintPubkey(data.pubkey);
      showToast("Mint pubkey generated successfully", "success");
    } catch (error) {
      console.error('Error generating mint pubkey:', error);
      showToast("Failed to generate mint pubkey", "error");
    }
    setIsGenerating(false);
  };

  // Get all wallets and filter those with SOL balance > 0
  const allWallets = getWallets();
  const wallets = allWallets.filter(wallet => (solBalances.get(wallet.address) || 0) > 0);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      handleRefresh();
    }
  }, [isOpen]);

  // Filter and sort wallets based on search term and other criteria
  const filterWallets = (walletList, search: string) => {
    // Apply search filter
    let filtered = walletList;
    if (search) {
      filtered = filtered.filter(wallet => 
        wallet.address.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Apply balance filter
    if (balanceFilter !== 'all') {
      if (balanceFilter === 'nonZero') {
        filtered = filtered.filter(wallet => (solBalances.get(wallet.address) || 0) > 0);
      } else if (balanceFilter === 'highBalance') {
        filtered = filtered.filter(wallet => (solBalances.get(wallet.address) || 0) >= 0.1);
      } else if (balanceFilter === 'lowBalance') {
        filtered = filtered.filter(wallet => (solBalances.get(wallet.address) || 0) < 0.1 && (solBalances.get(wallet.address) || 0) > 0);
      }
    }
    
    // Sort the wallets
    return filtered.sort((a, b) => {
      if (sortOption === 'address') {
        return sortDirection === 'asc' 
          ? a.address.localeCompare(b.address)
          : b.address.localeCompare(a.address);
      } else if (sortOption === 'balance') {
        const balanceA = solBalances.get(a.address) || 0;
        const balanceB = solBalances.get(b.address) || 0;
        return sortDirection === 'asc' ? balanceA - balanceB : balanceB - balanceA;
      }
      return 0;
    });
  };

  const handleWalletSelection = (privateKey: string) => {
    setSelectedWallets(prev => {
      if (prev.includes(privateKey)) {
        return prev.filter(key => key !== privateKey);
      }
      // Check if already at max capacity
      if (prev.length >= MAX_WALLETS) {
        showToast(`Maximum ${MAX_WALLETS} wallets can be selected`, "error");
        return prev;
      }
      return [...prev, privateKey];
    });
  };

  const handleAmountChange = (privateKey: string, amount: string) => {
    if (amount === '' || /^\d*\.?\d*$/.test(amount)) {
      setWalletAmounts(prev => ({
        ...prev,
        [privateKey]: amount
      }));
    }
  };

  const validateStep = () => {
    switch (currentStep) {
      case 0:
        if (!tokenData.name || !tokenData.symbol || !tokenData.file || !mintPubkey) {
          showToast("Name, symbol, logo URL, and mint pubkey are required", "error");
          return false;
        }
        break;
      case 1:
        if (selectedWallets.length === 0) {
          showToast("Please select at least one wallet", "error");
          return false;
        }
        if (selectedWallets.length > MAX_WALLETS) {
          showToast(`Maximum ${MAX_WALLETS} wallets can be selected`, "error");
          return false;
        }
        const hasAllAmounts = selectedWallets.every(wallet => 
          walletAmounts[wallet] && Number(walletAmounts[wallet]) > 0
        );
        if (!hasAllAmounts) {
          showToast("Please enter valid amounts for all selected wallets", "error");
          return false;
        }
        break;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep(prev => Math.min(prev + 1, STEPS_DEPLOY.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed || !mintPubkey) return;

    setIsSubmitting(true);
    
    try {
      // Format wallets for pump create with address and private key
      const pumpCreateWallets: WalletForPumpCreate[] = selectedWallets.map(privateKey => {
        const wallet = wallets.find(w => w.privateKey === privateKey);
        if (!wallet) {
          throw new Error(`Wallet not found`);
        }
        return {
          address: wallet.address,
          privateKey: privateKey
        };
      });
      
      // Format amounts as numbers
      const customAmounts = selectedWallets.map(key => parseFloat(walletAmounts[key]));
      
      // Create token configuration object
      const tokenCreationConfig: TokenCreationConfig = {
        mintPubkey: mintPubkey,
        config: {
          tokenCreation: {
            metadata: {
              name: tokenData.name,
              symbol: tokenData.symbol,
              description: tokenData.description,
              telegram: tokenData.telegram,
              twitter: tokenData.twitter,
              website: tokenData.website,
              file: tokenData.file
            },
            defaultSolAmount: customAmounts[0] || 0.1 // Use first wallet's amount as default
          },
        }
      };
      
      console.log(`Starting client-side token creation with ${pumpCreateWallets.length} wallets`);
      
      // Call our client-side execution function instead of the backend
      const result = await executePumpCreate(
        pumpCreateWallets,
        tokenCreationConfig,
        customAmounts
      );
      
      if (result.success) {
        showToast(`Token deployment successful! Mint address: ${result.mintAddress}`, "success");
        // Reset form state
        setSelectedWallets([]);
        setWalletAmounts({});
        setMintPubkey('');
        setTokenData({
          name: '',
          symbol: '',
          description: '',
          telegram: '',
          twitter: '',
          website: '',
          file: ''
        });
        setIsConfirmed(false);
        setCurrentStep(0);
        onClose();
      } else {
        throw new Error(result.error || "Token deployment failed");
      }
    } catch (error) {
      console.error('Error during token deployment:', error);
      showToast(`Token deployment failed: ${error.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Format SOL balance for display
  const formatSolBalance = (balance: number) => {
    return balance.toFixed(4);
  };

  // Calculate total SOL to be used
  const calculateTotalAmount = () => {
    return selectedWallets.reduce((total, wallet) => {
      return total + (parseFloat(walletAmounts[wallet]) || 0);
    }, 0);
  };

  // Get wallet by private key
  const getWalletByPrivateKey = (privateKey: string) => {
    return wallets.find(wallet => wallet.privateKey === privateKey);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#02b36d20] mr-3">
                <PlusCircle size={16} className="text-[#02b36d]" />
              </div>
              <h3 className="text-lg font-semibold text-[#e4fbf2] font-mono">
                <span className="text-[#02b36d]">/</span> TOKEN DETAILS <span className="text-[#02b36d]">/</span>
              </h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-[#7ddfbd] font-mono uppercase tracking-wider">
                    <span className="text-[#02b36d]">&#62;</span> Mint Pubkey <span className="text-[#02b36d]">&#60;</span>
                  </label>
                  <div className="relative" onMouseEnter={() => setShowInfoTip(true)} onMouseLeave={() => setShowInfoTip(false)}>
                    <Info size={14} className="text-[#7ddfbd] cursor-help" />
                    {showInfoTip && (
                      <div className="absolute left-0 bottom-full mb-2 p-2 bg-[#091217] border border-[#02b36d30] rounded shadow-lg text-xs text-[#e4fbf2] w-48 z-10 font-mono">
                        This key is sensitive! Do not share.
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={generateMintPubkey}
                  disabled={isGenerating}
                  className={`px-4 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1 modal-btn-cyberpunk
                    ${isGenerating 
                      ? 'bg-[#091217] text-[#7ddfbd] cursor-not-allowed' 
                      : 'bg-[#091217] hover:bg-[#0a1419] border border-[#02b36d40] hover:border-[#02b36d] text-[#e4fbf2] shadow-lg hover:shadow-[#02b36d40] transform hover:-translate-y-0.5'
                    }`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-[#02b36d]" />
                      <span className="font-mono tracking-wider">GENERATING...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} className="text-[#02b36d]" />
                      <span className="font-mono tracking-wider">GENERATE</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={mintPubkey}
                  onChange={(e) => setMintPubkey(e.target.value)}
                  className="w-full pl-4 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                  placeholder="ENTER OR GENERATE A MINT PUBKEY"
                />
              </div>
            </div>

            <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg modal-glow">
              <div className="p-6 space-y-6 relative">
                {/* Ambient grid background */}
                <div className="absolute inset-0 z-0 opacity-10"
                     style={{
                       backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
                       backgroundSize: '20px 20px',
                       backgroundPosition: 'center center',
                     }}>
                </div>
              
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#7ddfbd] flex items-center gap-1 font-mono uppercase tracking-wider">
                      <span className="text-[#02b36d]">&#62;</span> Name <span className="text-[#02b36d]">*</span> <span className="text-[#02b36d]">&#60;</span>
                    </label>
                    <input
                      type="text"
                      value={tokenData.name}
                      onChange={(e) => setTokenData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-[#091217] border border-[#02b36d30] rounded-lg p-2.5 text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                      placeholder="ENTER TOKEN NAME"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#7ddfbd] flex items-center gap-1 font-mono uppercase tracking-wider">
                      <span className="text-[#02b36d]">&#62;</span> Symbol <span className="text-[#02b36d]">*</span> <span className="text-[#02b36d]">&#60;</span>
                    </label>
                    <input
                      type="text"
                      value={tokenData.symbol}
                      onChange={(e) => setTokenData(prev => ({ ...prev, symbol: e.target.value }))}
                      className="w-full bg-[#091217] border border-[#02b36d30] rounded-lg p-2.5 text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                      placeholder="ENTER TOKEN SYMBOL"
                    />
                  </div>
                </div>
  
                <div className="space-y-2 relative z-10">
                  <label className="text-sm font-medium text-[#7ddfbd] font-mono uppercase tracking-wider">
                    <span className="text-[#02b36d]">&#62;</span> Description <span className="text-[#02b36d]">&#60;</span>
                  </label>
                  <textarea
                    value={tokenData.description}
                    onChange={(e) => setTokenData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-[#091217] border border-[#02b36d30] rounded-lg p-2.5 text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk min-h-24 font-mono"
                    placeholder="DESCRIBE YOUR TOKEN"
                    rows={3}
                  />
                </div>
  
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#7ddfbd] font-mono uppercase tracking-wider">
                      <span className="text-[#02b36d]">&#62;</span> Telegram <span className="text-[#02b36d]">&#60;</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tokenData.telegram}
                        onChange={(e) => setTokenData(prev => ({ ...prev, telegram: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                        placeholder="T.ME/YOURGROUP"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-[#7ddfbd]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21.8,5.1c-0.2-0.8-0.9-1.4-1.7-1.6C18.4,3,12,3,12,3S5.6,3,3.9,3.5C3.1,3.7,2.4,4.3,2.2,5.1C1.7,6.8,1.7,10,1.7,10s0,3.2,0.5,4.9c0.2,0.8,0.9,1.4,1.7,1.6C5.6,17,12,17,12,17s6.4,0,8.1-0.5c0.8-0.2,1.5-0.8,1.7-1.6c0.5-1.7,0.5-4.9,0.5-4.9S22.3,6.8,21.8,5.1z M9.9,13.1V6.9l5.4,3.1L9.9,13.1z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#7ddfbd] font-mono uppercase tracking-wider">
                      <span className="text-[#02b36d]">&#62;</span> Twitter <span className="text-[#02b36d]">&#60;</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tokenData.twitter}
                        onChange={(e) => setTokenData(prev => ({ ...prev, twitter: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                        placeholder="@YOURHANDLE"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-[#7ddfbd]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 4.01c-1 .49-1.98.689-3 .99-1.121-1.265-2.783-1.335-4.38-.737S11.977 6.323 12 8v1c-3.245.083-6.135-1.395-8-4 0 0-4.182 7.433 4 11-1.872 1.247-3.739 2.088-6 2 3.308 1.803 6.913 2.423 10.034 1.517 3.58-1.04 6.522-3.723 7.651-7.742a13.84 13.84 0 0 0 .497-3.753C20.18 7.773 21.692 5.25 22 4.009z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#7ddfbd] font-mono uppercase tracking-wider">
                      <span className="text-[#02b36d]">&#62;</span> Website <span className="text-[#02b36d]">&#60;</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tokenData.website}
                        onChange={(e) => setTokenData(prev => ({ ...prev, website: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                        placeholder="HTTPS://YOURSITE.COM"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-[#7ddfbd]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zm14-6a9 9 0 0 0-4-2m-6 2a9 9 0 0 0-2 4m2 6a9 9 0 0 0 4 2m6-2a9 9 0 0 0 2-4" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
  
                <div className="space-y-2 relative z-10">
                  <label className="text-sm font-medium text-[#7ddfbd] flex items-center gap-1 font-mono uppercase tracking-wider">
                    <span className="text-[#02b36d]">&#62;</span> Logo URL <span className="text-[#02b36d]">*</span> <span className="text-[#02b36d]">&#60;</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={tokenData.file}
                      onChange={(e) => setTokenData(prev => ({ ...prev, file: e.target.value }))}
                      className="w-full pl-9 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                      placeholder="ENTER LOGO URL"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Upload size={16} className="text-[#7ddfbd]" />
                    </div>
                  </div>
                  {tokenData.file && (
                    <div className="mt-2 flex items-center">
                      <span className="text-xs text-[#7ddfbd] mr-2 font-mono">PREVIEW:</span>
                      <div className="w-8 h-8 rounded overflow-hidden border border-[#02b36d40]">
                        <img 
                          src={tokenData.file}
                          alt="Logo Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/api/placeholder/32/32';
                            e.currentTarget.alt = 'Failed to load';
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
        
      case 1:
        return (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#02b36d20] mr-3">
                  <Settings size={16} className="text-[#02b36d]" />
                </div>
                <h3 className="text-lg font-semibold text-[#e4fbf2] font-mono">
                  <span className="text-[#02b36d]">/</span> SELECT WALLETS & ORDER <span className="text-[#02b36d]">/</span>
                </h3>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedWallets.length === wallets.length || selectedWallets.length > 0) {
                      setSelectedWallets([]);
                    } else {
                      // Only select up to MAX_WALLETS
                      const walletsToSelect = wallets.slice(0, MAX_WALLETS);
                      setSelectedWallets(walletsToSelect.map(w => w.privateKey));
                      if (wallets.length > MAX_WALLETS) {
                        showToast(`Maximum ${MAX_WALLETS} wallets can be selected`, "error");
                      }
                    }
                  }}
                  className="text-sm text-[#02b36d] hover:text-[#7ddfbd] font-medium transition duration-200 font-mono glitch-text"
                >
                  {selectedWallets.length > 0 ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
              </div>
            </div>
  
            {/* Search and Filter Controls */}
            <div className="flex items-center space-x-3 mb-3">
              <div className="relative flex-grow">
                <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#7ddfbd]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-sm text-[#e4fbf2] focus:outline-none focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                  placeholder="SEARCH WALLETS..."
                />
              </div>
              
              <select 
                className="bg-[#091217] border border-[#02b36d30] rounded-lg px-3 py-2.5 text-sm text-[#e4fbf2] focus:outline-none focus:border-[#02b36d] modal-input-cyberpunk font-mono"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
              >
                <option value="address">ADDRESS</option>
                <option value="balance">BALANCE</option>
              </select>
              
              <button
                className="p-2.5 bg-[#091217] border border-[#02b36d30] rounded-lg text-[#7ddfbd] hover:border-[#02b36d] hover:text-[#02b36d] transition-all modal-btn-cyberpunk flex items-center justify-center"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              >
                {sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              </button>

              <select 
                className="bg-[#091217] border border-[#02b36d30] rounded-lg px-3 py-2.5 text-sm text-[#e4fbf2] focus:outline-none focus:border-[#02b36d] modal-input-cyberpunk font-mono"
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
              >
                <option value="all">ALL BALANCES</option>
                <option value="nonZero">NON-ZERO</option>
                <option value="highBalance">HIGH BALANCE</option>
                <option value="lowBalance">LOW BALANCE</option>
              </select>
            </div>

            {/* Wallet Selection Limit Info */}
            <div className="bg-[#091217] border border-[#02b36d40] rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-[#02b36d]" />
                <span className="text-sm text-[#7ddfbd] font-mono">
                  YOU CAN SELECT A MAXIMUM OF {MAX_WALLETS} WALLETS (INCLUDING DEVELOPER WALLET)
                </span>
              </div>
            </div>

            {/* Summary Stats */}
            {selectedWallets.length > 0 && (
              <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg p-3 mb-3 shadow-lg modal-glow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#7ddfbd] font-mono">SELECTED:</span>
                    <span className="text-sm font-medium text-[#02b36d] font-mono">
                      {selectedWallets.length} / {MAX_WALLETS} WALLET{selectedWallets.length !== 1 ? 'S' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#7ddfbd] font-mono">TOTAL SOL:</span>
                    <span className="text-sm font-medium text-[#02b36d] font-mono">{calculateTotalAmount().toFixed(4)} SOL</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg modal-glow relative">
              {/* Ambient grid background */}
              <div className="absolute inset-0 z-0 opacity-10"
                   style={{
                     backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
                     backgroundSize: '20px 20px',
                     backgroundPosition: 'center center',
                   }}>
              </div>
              
              <div className="p-4 relative z-10">
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#02b36d40] scrollbar-track-[#091217]">
                  {/* Selected Wallets */}
                  {selectedWallets.length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm font-medium text-[#7ddfbd] mb-2 font-mono uppercase tracking-wider">
                        <span className="text-[#02b36d]">&#62;</span> Selected Wallets <span className="text-[#02b36d]">&#60;</span>
                      </div>
                      {selectedWallets.map((privateKey, index) => {
                        const wallet = getWalletByPrivateKey(privateKey);
                        const solBalance = wallet ? solBalances.get(wallet.address) || 0 : 0;
                        
                        return (
                          <div
                            key={wallet?.id}
                            className="p-3 rounded-lg border border-[#02b36d] bg-[#02b36d10] mb-2 shadow-lg modal-glow"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (index > 0) {
                                        const newOrder = [...selectedWallets];
                                        [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
                                        setSelectedWallets(newOrder);
                                      }
                                    }}
                                    disabled={index === 0}
                                    className={`p-1 rounded hover:bg-[#091217] transition-all ${index === 0 ? 'opacity-50 cursor-not-allowed' : 'modal-btn-cyberpunk'}`}
                                  >
                                    <ArrowUp size={16} className="text-[#e4fbf2]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (index < selectedWallets.length - 1) {
                                        const newOrder = [...selectedWallets];
                                        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                        setSelectedWallets(newOrder);
                                      }
                                    }}
                                    disabled={index === selectedWallets.length - 1}
                                    className={`p-1 rounded hover:bg-[#091217] transition-all ${index === selectedWallets.length - 1 ? 'opacity-50 cursor-not-allowed' : 'modal-btn-cyberpunk'}`}
                                  >
                                    <ArrowDown size={16} className="text-[#e4fbf2]" />
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#02b36d] font-mono">{index === 0 ? 'DEVELOPER' : `#${index + 1}`}</span>
                                    <span className="text-sm font-medium text-[#e4fbf2] font-mono glitch-text">
                                      {wallet ? formatAddress(wallet.address) : 'UNKNOWN'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-[#7ddfbd] font-mono">BALANCE:</span>
                                    <span className="text-sm font-medium text-[#e4fbf2] font-mono">{formatSolBalance(solBalance)} SOL</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <DollarSign size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#7ddfbd]" />
                                  <input
                                    type="text"
                                    value={walletAmounts[privateKey] || ''}
                                    onChange={(e) => handleAmountChange(privateKey, e.target.value)}
                                    placeholder="AMOUNT"
                                    className="w-32 pl-9 pr-2 py-2 bg-[#091217] border border-[#02b36d30] rounded-lg text-sm text-[#e4fbf2] placeholder-[#7ddfbd70] focus:outline-none focus:ring-1 focus:ring-[#02b36d50] focus:border-[#02b36d] transition-all modal-input-cyberpunk font-mono"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleWalletSelection(privateKey)}
                                  className="p-1 rounded hover:bg-[#091217] transition-all modal-btn-cyberpunk"
                                >
                                  <X size={18} className="text-[#7ddfbd] hover:text-[#e4fbf2]" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Available Wallets - Only show if we haven't reached the maximum */}
                  {selectedWallets.length < MAX_WALLETS && (
                    <div>
                      <div className="text-sm font-medium text-[#7ddfbd] mb-2 font-mono uppercase tracking-wider">
                        <span className="text-[#02b36d]">&#62;</span> Available Wallets <span className="text-[#02b36d]">&#60;</span>
                      </div>
                      {filterWallets(wallets.filter(w => !selectedWallets.includes(w.privateKey)), searchTerm).map((wallet) => {
                        const solBalance = solBalances.get(wallet.address) || 0;
                        
                        return (
                          <div
                            key={wallet.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-[#02b36d40] hover:border-[#02b36d] hover:bg-[#091217] transition-all duration-200 mb-2 cursor-pointer"
                            onClick={() => handleWalletSelection(wallet.privateKey)}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-5 h-5 rounded-full border border-[#02b36d40] flex items-center justify-center cursor-pointer hover:border-[#02b36d] transition-all">
                                <PlusCircle size={14} className="text-[#7ddfbd]" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-sm font-medium text-[#e4fbf2] font-mono glitch-text">
                                  {formatAddress(wallet.address)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-[#7ddfbd] font-mono">BALANCE:</span>
                                  <span className="text-sm font-medium text-[#e4fbf2] font-mono">{formatSolBalance(solBalance)} SOL</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filterWallets(wallets.filter(w => !selectedWallets.includes(w.privateKey)), searchTerm).length === 0 && (
                        <div className="text-center py-4 text-[#7ddfbd] font-mono">
                          {searchTerm ? "NO WALLETS FOUND MATCHING YOUR SEARCH" : "NO WALLETS AVAILABLE"}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Message when max wallets reached */}
                  {selectedWallets.length >= MAX_WALLETS && (
                    <div className="text-center py-4 bg-[#091217] border border-[#02b36d40] rounded-lg">
                      <div className="text-[#02b36d] font-mono">
                        MAXIMUM NUMBER OF WALLETS ({MAX_WALLETS}) REACHED
                      </div>
                      <div className="text-[#7ddfbd] text-sm font-mono mt-1">
                        REMOVE A WALLET TO ADD A DIFFERENT ONE
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
  
      case 2:
        return (
          <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#02b36d20] mr-3">
                <CheckCircle size={16} className="text-[#02b36d]" />
              </div>
              <h3 className="text-lg font-semibold text-[#e4fbf2] font-mono">
                <span className="text-[#02b36d]">/</span> REVIEW DEPLOYMENT <span className="text-[#02b36d]">/</span>
              </h3>
            </div>
  
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column - Token Details */}
              <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg modal-glow relative">
                {/* Ambient grid background */}
                <div className="absolute inset-0 z-0 opacity-10"
                     style={{
                       backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
                       backgroundSize: '20px 20px',
                       backgroundPosition: 'center center',
                     }}>
                </div>
                
                <div className="p-6 space-y-4 relative z-10">
                  <h4 className="text-sm font-medium text-[#7ddfbd] mb-3 font-mono uppercase tracking-wider">
                    <span className="text-[#02b36d]">&#62;</span> Token Details <span className="text-[#02b36d]">&#60;</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#7ddfbd] font-mono">NAME:</span>
                      <span className="text-sm font-medium text-[#e4fbf2] font-mono">{tokenData.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#7ddfbd] font-mono">SYMBOL:</span>
                      <span className="text-sm font-medium text-[#e4fbf2] font-mono">{tokenData.symbol}</span>
                    </div>
                    {tokenData.description && (
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-[#7ddfbd] font-mono">DESCRIPTION:</span>
                        <span className="text-sm text-[#e4fbf2] text-right max-w-[70%] font-mono">
                          {tokenData.description.substring(0, 100)}{tokenData.description.length > 100 ? '...' : ''}
                        </span>
                      </div>
                    )}
                    {tokenData.file && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#7ddfbd] font-mono">LOGO:</span>
                        <div className="bg-[#091217] border border-[#02b36d40] rounded-lg p-1 w-12 h-12 flex items-center justify-center">
                          <img 
                            src={tokenData.file}
                            alt="Token Logo"
                            className="max-w-full max-h-full rounded object-contain"
                            onError={(e) => {
                              e.currentTarget.src = '/api/placeholder/48/48';
                              e.currentTarget.alt = 'Failed to load';
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {(tokenData.telegram || tokenData.twitter || tokenData.website) && (
                    <>
                      <div className="h-px bg-[#02b36d30] my-3"></div>
                      <h4 className="text-sm font-medium text-[#7ddfbd] mb-2 font-mono uppercase tracking-wider">
                        <span className="text-[#02b36d]">&#62;</span> Social Links <span className="text-[#02b36d]">&#60;</span>
                      </h4>
                      <div className="space-y-2">
                        {tokenData.telegram && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#7ddfbd] font-mono">TELEGRAM:</span>
                            <span className="text-sm text-[#02b36d] font-mono">{tokenData.telegram}</span>
                          </div>
                        )}
                        {tokenData.twitter && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#7ddfbd] font-mono">TWITTER:</span>
                            <span className="text-sm text-[#02b36d] font-mono">{tokenData.twitter}</span>
                          </div>
                        )}
                        {tokenData.website && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[#7ddfbd] font-mono">WEBSITE:</span>
                            <span className="text-sm text-[#02b36d] font-mono">{tokenData.website}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  <div className="h-px bg-[#02b36d30] my-3"></div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#7ddfbd] font-mono">TOTAL SOL:</span>
                      <span className="text-sm font-medium text-[#02b36d] font-mono">{calculateTotalAmount().toFixed(4)} SOL</span>
                    </div>
                  </div>
                </div>
                
                {/* Cyberpunk decorative corner elements */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#02b36d] opacity-70"></div>
              </div>
              
              {/* Right column - Selected Wallets */}
              <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg modal-glow relative">
                {/* Ambient grid background */}
                <div className="absolute inset-0 z-0 opacity-10"
                     style={{
                       backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
                       backgroundSize: '20px 20px',
                       backgroundPosition: 'center center',
                     }}>
                </div>
                
                <div className="p-6 space-y-4 relative z-10">
                  <h4 className="text-sm font-medium text-[#7ddfbd] mb-3 font-mono uppercase tracking-wider">
                    <span className="text-[#02b36d]">&#62;</span> Selected Wallets <span className="text-[#02b36d]">&#60;</span>
                  </h4>
                  <div className="max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#02b36d40] scrollbar-track-[#091217]">
                    {selectedWallets.map((key, index) => {
                      const wallet = getWalletByPrivateKey(key);
                      const solBalance = wallet ? solBalances.get(wallet.address) || 0 : 0;
                      
                      return (
                        <div key={index} className="flex justify-between items-center p-3 bg-[#091217] rounded-lg mb-2 border border-[#02b36d30] hover:border-[#02b36d] transition-all">
                          <div className="flex items-center gap-2">
                            <span className="text-[#02b36d] text-xs font-medium w-6 font-mono">{index === 0 ? 'DEV' : `#${index + 1}`}</span>
                            <span className="font-mono text-sm text-[#e4fbf2] glitch-text">
                              {wallet ? formatAddress(wallet.address) : 'UNKNOWN'}
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-[#7ddfbd] font-mono">CURRENT: {formatSolBalance(solBalance)} SOL</span>
                            <span className="text-sm font-medium text-[#02b36d] font-mono">{walletAmounts[key]} SOL</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Cyberpunk decorative corner elements */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#02b36d] opacity-70"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#02b36d] opacity-70"></div>
              </div>
            </div>
  
            <div className="bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg modal-glow">
              <div className="p-4 relative">
                {/* Ambient grid background */}
                <div className="absolute inset-0 z-0 opacity-10"
                     style={{
                       backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
                       backgroundSize: '20px 20px',
                       backgroundPosition: 'center center',
                     }}>
                </div>
                
                <div className="flex items-center gap-4 relative z-10">
                  <div 
                    onClick={() => setIsConfirmed(!isConfirmed)}
                    className="relative w-5 h-5 cursor-pointer"
                  >
                    <div className={`w-5 h-5 border rounded transition-all ${isConfirmed ? 'bg-[#02b36d] border-[#02b36d]' : 'border-[#02b36d40]'}`}></div>
                    {isConfirmed && (
                      <CheckCircle size={14} className="absolute top-0.5 left-0.5 text-[#050a0e]" />
                    )}
                  </div>
                  <label 
                    onClick={() => setIsConfirmed(!isConfirmed)}
                    className="text-sm text-[#e4fbf2] leading-relaxed cursor-pointer select-none font-mono"
                  >
                    I CONFIRM THAT I WANT TO DEPLOY THIS TOKEN USING {selectedWallets.length} WALLET{selectedWallets.length !== 1 ? 'S' : ''}.
                    THIS ACTION CANNOT BE UNDONE.
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };
  
  // If modal is not open, don't render anything
  if (!isOpen) return null;

  // Animation keyframes for cyberpunk elements
  const modalStyleElement = document.createElement('style');
  modalStyleElement.textContent = `
    @keyframes modal-pulse {
      0% { box-shadow: 0 0 5px rgba(2, 179, 109, 0.5), 0 0 15px rgba(2, 179, 109, 0.2); }
      50% { box-shadow: 0 0 15px rgba(2, 179, 109, 0.8), 0 0 25px rgba(2, 179, 109, 0.4); }
      100% { box-shadow: 0 0 5px rgba(2, 179, 109, 0.5), 0 0 15px rgba(2, 179, 109, 0.2); }
    }
    
    @keyframes modal-fade-in {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    
    @keyframes modal-slide-up {
      0% { transform: translateY(20px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes modal-scan-line {
      0% { transform: translateY(-100%); opacity: 0.3; }
      100% { transform: translateY(100%); opacity: 0; }
    }
    
    .modal-cyberpunk-container {
      animation: modal-fade-in 0.3s ease;
    }
    
    .modal-cyberpunk-content {
      animation: modal-slide-up 0.4s ease;
      position: relative;
    }
    
    .modal-cyberpunk-content::before {
      content: "";
      position: absolute;
      width: 100%;
      height: 5px;
      background: linear-gradient(to bottom, 
        transparent 0%,
        rgba(2, 179, 109, 0.2) 50%,
        transparent 100%);
      z-index: 10;
      animation: modal-scan-line 8s linear infinite;
      pointer-events: none;
    }
    
    .modal-glow {
      animation: modal-pulse 4s infinite;
    }
    
    .modal-input-cyberpunk:focus {
      box-shadow: 0 0 0 1px rgba(2, 179, 109, 0.7), 0 0 15px rgba(2, 179, 109, 0.5);
      transition: all 0.3s ease;
    }
    
    .modal-btn-cyberpunk {
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    .modal-btn-cyberpunk::after {
      content: "";
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(
        to bottom right,
        rgba(2, 179, 109, 0) 0%,
        rgba(2, 179, 109, 0.3) 50%,
        rgba(2, 179, 109, 0) 100%
      );
      transform: rotate(45deg);
      transition: all 0.5s ease;
      opacity: 0;
    }
    
    .modal-btn-cyberpunk:hover::after {
      opacity: 1;
      transform: rotate(45deg) translate(50%, 50%);
    }
    
    .modal-btn-cyberpunk:active {
      transform: scale(0.95);
    }
    
    .progress-bar-cyberpunk {
      position: relative;
      overflow: hidden;
    }
    
    .progress-bar-cyberpunk::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(2, 179, 109, 0.7) 50%,
        transparent 100%
      );
      width: 100%;
      height: 100%;
      transform: translateX(-100%);
      animation: progress-shine 3s infinite;
    }
    
    @keyframes progress-shine {
      0% { transform: translateX(-100%); }
      20% { transform: translateX(100%); }
      100% { transform: translateX(100%); }
    }
    
    .glitch-text:hover {
      text-shadow: 0 0 2px #02b36d, 0 0 4px #02b36d;
      animation: glitch 2s infinite;
    }
    
    @keyframes glitch {
      2%, 8% { transform: translate(-2px, 0) skew(0.3deg); }
      4%, 6% { transform: translate(2px, 0) skew(-0.3deg); }
      62%, 68% { transform: translate(0, 0) skew(0.33deg); }
      64%, 66% { transform: translate(0, 0) skew(-0.33deg); }
    }
  `;
  document.head.appendChild(modalStyleElement);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm modal-cyberpunk-container" style={{backgroundColor: 'rgba(5, 10, 14, 0.85)'}}>
      <div className="relative bg-[#050a0e] border border-[#02b36d40] rounded-lg shadow-lg w-full max-w-3xl overflow-hidden transform modal-cyberpunk-content modal-glow">
        {/* Ambient grid background */}
        <div className="absolute inset-0 z-0 opacity-10"
             style={{
               backgroundImage: 'linear-gradient(rgba(2, 179, 109, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 179, 109, 0.2) 1px, transparent 1px)',
               backgroundSize: '20px 20px',
               backgroundPosition: 'center center',
             }}>
        </div>

        {/* Header */}
        <div className="relative z-10 p-4 flex justify-between items-center border-b border-[#02b36d40]">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#02b36d20] mr-3">
              <PlusCircle size={16} className="text-[#02b36d]" />
            </div>
            <h2 className="text-lg font-semibold text-[#e4fbf2] font-mono">
              <span className="text-[#02b36d]">/</span> DEPLOY TOKEN <span className="text-[#02b36d]">/</span>
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-[#7ddfbd] hover:text-[#02b36d] transition-colors p-1 hover:bg-[#02b36d20] rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="relative w-full h-1 bg-[#091217] progress-bar-cyberpunk">
          <div 
            className="h-full bg-[#02b36d] transition-all duration-300"
            style={{ width: `${(currentStep + 1) / STEPS_DEPLOY.length * 100}%` }}
          ></div>
        </div>

        {/* Content */}
        <div className="relative z-10 p-6 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-[#02b36d40] scrollbar-track-[#091217]">
          <form onSubmit={currentStep === STEPS_DEPLOY.length - 1 ? handleDeploy : (e) => e.preventDefault()}>
            <div className="min-h-[300px]">
              {renderStepContent()}
            </div>

            <div className="flex justify-between mt-8 pt-4 border-t border-[#02b36d30]">
              <button
                type="button"
                onClick={currentStep === 0 ? onClose : handleBack}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-[#e4fbf2] bg-[#091217] border border-[#02b36d30] hover:bg-[#0a1419] hover:border-[#02b36d] rounded-lg transition-all duration-200 shadow-md font-mono tracking-wider modal-btn-cyberpunk"
              >
                {currentStep === 0 ? 'CANCEL' : 'BACK'}
              </button>

              <button
                type={currentStep === STEPS_DEPLOY.length - 1 ? 'submit' : 'button'}
                onClick={currentStep === STEPS_DEPLOY.length - 1 ? undefined : handleNext}
                disabled={currentStep === STEPS_DEPLOY.length - 1 ? (isSubmitting || !isConfirmed) : isSubmitting}
                className={`px-5 py-2.5 rounded-lg flex items-center transition-all shadow-lg font-mono tracking-wider ${
                  currentStep === STEPS_DEPLOY.length - 1 && (isSubmitting || !isConfirmed)
                    ? 'bg-[#02b36d50] text-[#050a0e80] cursor-not-allowed opacity-50'
                    : 'bg-[#02b36d] text-[#050a0e] hover:bg-[#01a35f] transform hover:-translate-y-0.5 modal-btn-cyberpunk'
                }`}
              >
                {currentStep === STEPS_DEPLOY.length - 1 ? (
                  isSubmitting ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-[#050a0e80] border-t-transparent animate-spin mr-2"></div>
                      <span>DEPLOYING...</span>
                    </>
                  ) : 'CONFIRM DEPLOY'
                ) : (
                  <span className="flex items-center">
                    NEXT
                    <ChevronRight size={16} className="ml-1" />
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
        
        {/* Cyberpunk decorative corner elements */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#02b36d] opacity-70"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#02b36d] opacity-70"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#02b36d] opacity-70"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#02b36d] opacity-70"></div>
      </div>
    </div>,
    document.body
  );
};