const express = require('express');
const quais = require('quais');
const app = express();

// Allow your Android app to connect
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Quai Service is running!' });
});

// Main transaction signing endpoint
app.post('/sign-transaction', async (req, res) => {
  try {
    const { privateKey, to, value, nonce, gasPrice, gasLimit, chainId, rpcUrl } = req.body;
    
    console.log('📥 Received transaction request');
    console.log('From PK (first 10 chars):', privateKey.substring(0, 10) + '...');
    console.log('To:', to);
    console.log('Value:', value, 'Wei');
    console.log('Nonce:', nonce);
    console.log('Chain ID:', chainId);
    console.log('RPC:', rpcUrl);
    
    // Create provider with explicit shard configuration
    const provider = new quais.JsonRpcProvider(rpcUrl, {
      chainId: parseInt(chainId),
      name: 'quai-cyprus1'
    });
    
    // Create wallet from private key WITHOUT provider first
    const wallet = new quais.Wallet(privateKey);
    
    // Then connect to provider
    const connectedWallet = wallet.connect(provider);
    
    console.log('✅ Wallet address:', connectedWallet.address);
    
    // Build transaction with proper quais format
    // CRITICAL: Don't use type: 0, let quais.js determine the type
    const tx = {
      to: to,
      from: connectedWallet.address, // Explicitly set from address
      value: value, // Keep as string
      nonce: parseInt(nonce),
      gasPrice: gasPrice, // Keep as string
      gasLimit: parseInt(gasLimit),
      chainId: parseInt(chainId)
      // Don't set type - let quais.js handle it
    };
    
    console.log('📝 Transaction object:');
    console.log(JSON.stringify(tx, null, 2));
    console.log('🔐 Signing and sending transaction...');
    
    // Sign and send transaction
    const txResponse = await connectedWallet.sendTransaction(tx);
    
    console.log('✅ Transaction sent successfully!');
    console.log('TX Hash:', txResponse.hash);
    
    // Wait for transaction to be mined (optional, with timeout)
    console.log('⏳ Waiting for transaction confirmation...');
    try {
      const receipt = await txResponse.wait(1); // Wait for 1 confirmation, max 30 seconds
      console.log('✅ Transaction confirmed!');
      console.log('Block:', receipt.blockNumber);
    } catch (waitError) {
      console.log('⚠️ Could not wait for confirmation (this is normal):', waitError.message);
      // This is okay - transaction was still sent
    }
    
    res.json({ 
      success: true,
      txHash: txResponse.hash 
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error info:', error.info);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message,
      code: error.code,
      info: error.info
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Quai encoding service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Sign endpoint: http://localhost:${PORT}/sign-transaction`);
});
