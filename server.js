const express = require('express');
const quais = require('quais');
const https = require('https');
const http = require('http');
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

// Helper function to make RPC calls directly
function makeRpcCall(rpcUrl, method, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(rpcUrl);
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Main transaction signing endpoint
app.post('/sign-transaction', async (req, res) => {
  try {
    const { privateKey, to, value, nonce, gasPrice, gasLimit, chainId, rpcUrl, data } = req.body;
    
    console.log('📥 Received transaction request');
    console.log('From PK (first 10 chars):', privateKey.substring(0, 10) + '...');
    console.log('To:', to);
    console.log('Value:', value, 'Wei');
    console.log('Nonce:', nonce);
    console.log('Chain ID:', chainId);
    console.log('RPC:', rpcUrl);
    console.log('Data (memo):', data || 'none');
    
    // Create provider
    const provider = new quais.JsonRpcProvider(rpcUrl, {
      chainId: parseInt(chainId),
      name: 'quai-cyprus1'
    });
    
    // Create wallet
    const wallet = new quais.Wallet(privateKey);
    const connectedWallet = wallet.connect(provider);
    
    console.log('✅ Wallet address:', connectedWallet.address);
    
    // Build transaction object
    const tx = {
      to: to,
      from: connectedWallet.address,
      value: value,
      nonce: parseInt(nonce),
      gasPrice: gasPrice,
      gasLimit: parseInt(gasLimit),
      chainId: parseInt(chainId)
    };
    
    // === CRITICAL: Add data field if provided (for memo tag) ===
    if (data && data !== '0x' && data !== '') {
      tx.data = data;
      console.log('📝 Including memo data in transaction:', data);
    }
    
    console.log('📝 Full transaction object:', JSON.stringify(tx, null, 2));
    
    // Sign transaction
    console.log('🔐 Signing transaction with quais.js (Protobuf encoding)...');
    const signedTx = await connectedWallet.signTransaction(tx);
    console.log('✅ Transaction signed successfully!');
    console.log('Signed TX (Protobuf - first 150 chars):', signedTx.substring(0, 150) + '...');
    console.log('Full signed TX length:', signedTx.length, 'chars');
    console.log('Full signed TX:', signedTx);
    
    // Broadcast using direct RPC call
    console.log('📤 Broadcasting via direct RPC call to:', rpcUrl);
    
    try {
      const txHash = await makeRpcCall(rpcUrl, 'quai_sendRawTransaction', [signedTx]);
      
      console.log('✅ Transaction accepted by node!');
      console.log('TX Hash:', txHash);
      
      // Verify transaction was accepted
      console.log('🔍 Verifying transaction on network...');
      
      try {
        // Wait a moment for the transaction to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to get transaction receipt
        const txReceipt = await makeRpcCall(rpcUrl, 'quai_getTransactionByHash', [txHash]);
        
        if (txReceipt) {
          console.log('✅ Transaction confirmed on network!');
          console.log('Transaction details:', JSON.stringify(txReceipt, null, 2));
        } else {
          console.log('⚠️ Transaction not yet visible on network (may take time to propagate)');
        }
      } catch (verifyError) {
        console.log('⚠️ Could not verify transaction immediately:', verifyError.message);
        console.log('This is normal - transaction may still be propagating');
      }
      
      // Check the balance to see if transaction affected it
      console.log('🔍 Checking sender balance...');
      try {
        const balance = await makeRpcCall(rpcUrl, 'quai_getBalance', [connectedWallet.address, 'latest']);
        console.log('Sender balance:', balance);
      } catch (balanceError) {
        console.log('⚠️ Could not check balance:', balanceError.message);
      }
      
      res.json({ 
        success: true,
        txHash: txHash,
        signedTransaction: signedTx,
        explorerUrl: `https://quaiscan.io/tx/${txHash}`
      });
      
    } catch (broadcastError) {
      console.error('❌ Broadcast error:', broadcastError.message);
      console.error('Error details:', broadcastError);
      
      res.status(500).json({ 
        success: false,
        error: broadcastError.message,
        signedTransaction: signedTx,
        info: 'Transaction was signed but broadcast failed. Try broadcasting manually: ' + signedTx
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Quai encoding service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`📍 Sign endpoint: http://localhost:${PORT}/sign-transaction`);
});
