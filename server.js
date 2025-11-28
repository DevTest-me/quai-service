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
    console.log('To:', to);
    console.log('Value:', value, 'Wei');
    console.log('Nonce:', nonce);
    console.log('Chain ID:', chainId);
    console.log('RPC:', rpcUrl);
    
    // Create provider
    const provider = new quais.JsonRpcProvider(rpcUrl);
    
    // Create wallet from private key
    const wallet = new quais.Wallet(privateKey, provider);
    
    console.log('✅ Wallet created:', wallet.address);
    
    // FIXED: Convert values to proper format for quais.js
    // quais.js expects BigInt or hex strings for large numbers
    const tx = {
      to: to,
      value: BigInt(value).toString(), // Convert to string representation of BigInt
      nonce: parseInt(nonce),
      gasPrice: BigInt(gasPrice).toString(), // Convert to string representation of BigInt
      gasLimit: parseInt(gasLimit),
      chainId: parseInt(chainId),
      type: 0 // Explicitly set transaction type to Legacy (Type 0)
    };
    
    console.log('📝 Transaction object:', JSON.stringify(tx, null, 2));
    console.log('🔐 Signing and sending transaction...');
    
    // Sign and send (quais.js handles Protobuf encoding automatically)
    const txResponse = await wallet.sendTransaction(tx);
    
    console.log('✅ Transaction sent successfully!');
    console.log('TX Hash:', txResponse.hash);
    console.log('TX Response:', JSON.stringify(txResponse, null, 2));
    
    res.json({ 
      success: true,
      txHash: txResponse.hash 
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Quai encoding service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Sign endpoint: http://localhost:${PORT}/sign-transaction`);
});
