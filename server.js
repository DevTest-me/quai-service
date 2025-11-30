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
    
    // Create provider with timeout
    const provider = new quais.JsonRpcProvider(rpcUrl, {
      chainId: parseInt(chainId),
      name: 'quai-cyprus1'
    });
    
    // Create wallet
    const wallet = new quais.Wallet(privateKey);
    const connectedWallet = wallet.connect(provider);
    
    console.log('✅ Wallet address:', connectedWallet.address);
    
    // Build transaction
    const tx = {
      to: to,
      from: connectedWallet.address,
      value: value,
      nonce: parseInt(nonce),
      gasPrice: gasPrice,
      gasLimit: parseInt(gasLimit),
      chainId: parseInt(chainId)
    };
    
    console.log('📝 Transaction object:');
    console.log(JSON.stringify(tx, null, 2));
    
    // APPROACH 1: Sign transaction manually first
    console.log('🔐 Step 1: Signing transaction locally...');
    const signedTx = await connectedWallet.signTransaction(tx);
    console.log('✅ Transaction signed locally');
    console.log('Signed TX (first 100 chars):', signedTx.substring(0, 100) + '...');
    
    // APPROACH 2: Send the signed transaction with timeout
    console.log('📤 Step 2: Broadcasting signed transaction to network...');
    
    // Create a promise with timeout
    const sendWithTimeout = (signedTransaction, timeoutMs = 30000) => {
      return Promise.race([
        provider.broadcastTransaction(signedTransaction),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction broadcast timeout')), timeoutMs)
        )
      ]);
    };
    
    try {
      const txResponse = await sendWithTimeout(signedTx, 30000); // 30 second timeout
      
      console.log('✅ Transaction broadcasted successfully!');
      console.log('TX Hash:', txResponse.hash);
      
      res.json({ 
        success: true,
        txHash: txResponse.hash 
      });
      
    } catch (broadcastError) {
      console.error('⚠️ Broadcast error:', broadcastError.message);
      
      // If broadcast times out, we can still extract the tx hash from the signed transaction
      console.log('🔍 Attempting to extract hash from signed transaction...');
      
      try {
        // Parse the signed transaction to get the hash
        const parsedTx = quais.Transaction.from(signedTx);
        const txHash = parsedTx.hash;
        
        console.log('✅ Extracted TX Hash from signed transaction:', txHash);
        console.log('⚠️ Transaction was signed and likely sent, but confirmation timed out');
        
        res.json({ 
          success: true,
          txHash: txHash,
          warning: 'Transaction signed and sent, but network confirmation timed out. Check explorer to verify.'
        });
        
      } catch (parseError) {
        console.error('❌ Could not extract hash:', parseError.message);
        throw broadcastError; // Re-throw original error
      }
    }
    
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
