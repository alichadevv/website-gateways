const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-super-secret-key';
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== Database ==========
function readDB() {
    const initialData = {
      users: [{
        id: id,
        email: 'admin@demo.com',
        password: bcrypt.hashSync('masyuu', 10),
        username: 'Owner',
        role: 'owner',
        apiKey: 'yk_',
        joinedAt: new Date().toISOString()
      }],
      transactions: [],
      withdrawals: [],
      balances: { totalBalance: 1000000, totalIncome: 0, totalExpense: 0, totalTransactions: 0 }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function getUserFromToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    return db.users.find(u => u.id === decoded.id);
  } catch { return null; }
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  const token = authHeader.split(' ')[1];
  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

// ========== Auth ==========
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Email tidak ditemukan' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Password salah' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role, apiKey: user.apiKey, joinedAt: user.joinedAt } });
});
app.post('/api/auth/register', (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib' });
  const db = readDB();
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email sudah terdaftar' });
  const newUser = {
    id: 'u' + uuidv4().slice(0,6),
    email,
    password: bcrypt.hashSync(password, 10),
    username: username || email.split('@')[0],
    role: 'user',
    apiKey: 'api_' + uuidv4().replace(/-/g,'').slice(0,16),
    joinedAt: new Date().toISOString()
  };
  db.users.push(newUser);
  writeDB(db);
  const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role, apiKey: newUser.apiKey, joinedAt: newUser.joinedAt } });
});

// ========== Profile ==========
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const { id, email, username, role, apiKey, joinedAt } = req.user;
  res.json({ id, email, username, role, apiKey, joinedAt });
});
app.put('/api/user/profile', authMiddleware, (req, res) => {
  const { email, password, username } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (email) user.email = email;
  if (username) user.username = username;
  if (password) user.password = bcrypt.hashSync(password, 10);
  writeDB(db);
  res.json({ message: 'Profile updated', user: { id: user.id, email: user.email, username: user.username, role: user.role, apiKey: user.apiKey, joinedAt: user.joinedAt } });
});
app.post('/api/user/regenerate-apikey', authMiddleware, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  const newApiKey = 'api_' + uuidv4().replace(/-/g,'').slice(0,16);
  user.apiKey = newApiKey;
  writeDB(db);
  res.json({ apiKey: newApiKey });
});

// ========== Dashboard ==========
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const db = readDB();
  res.json(db.balances);
});

// ========== Transactions ==========
app.get('/api/transactions', authMiddleware, (req, res) => {
  let db = readDB();
  let txs = db.transactions;
  const { status, search } = req.query;
  if (status && status !== 'Semua') txs = txs.filter(t => t.status.toLowerCase() === status.toLowerCase());
  if (search) txs = txs.filter(t => t.invoiceId.toLowerCase().includes(search.toLowerCase()));
  res.json(txs);
});
app.post('/api/transactions/create', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 500) return res.status(400).json({ error: 'Minimal Rp 500' });
  const db = readDB();
  const invoiceId = 'INV-' + uuidv4().slice(0,8).toUpperCase();
  const qrImage = await QRCode.toDataURL(`QRIS|${invoiceId}|${amount}|IDR|DEMO`);
  const newTx = { invoiceId, amount: parseInt(amount), status: 'pending', createdAt: new Date().toISOString(), paidAt: null, qrImage };
  db.transactions.push(newTx);
  db.balances.totalTransactions += 1;
  writeDB(db);
  res.json({ success: true, transaction: newTx });
});
app.put('/api/transactions/:invoiceId/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const { invoiceId } = req.params;
  const db = readDB();
  const tx = db.transactions.find(t => t.invoiceId === invoiceId);
  if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  if (tx.status === 'paid') return res.status(400).json({ error: 'Sudah lunas' });
  tx.status = status;
  if (status === 'paid') {
    tx.paidAt = new Date().toISOString();
    db.balances.totalBalance += tx.amount;
    db.balances.totalIncome += tx.amount;
  }
  writeDB(db);
  res.json({ success: true, transaction: tx });
});

// ========== Withdrawals ==========
app.get('/api/withdrawals', authMiddleware, (req, res) => {
  let db = readDB();
  let wds = db.withdrawals;
  const { status, search } = req.query;
  if (status && status !== 'Semua') wds = wds.filter(w => w.status.toLowerCase() === status.toLowerCase());
  if (search) wds = wds.filter(w => w.id.toLowerCase().includes(search.toLowerCase()));
  res.json(wds);
});
app.post('/api/withdraw', authMiddleware, (req, res) => {
  const { method, accountNumber, accountName, amount, ewalletProvider } = req.body;
  if (!amount || amount < 10000) return res.status(400).json({ error: 'Minimal Rp 10.000' });
  const db = readDB();
  const balance = db.balances.totalBalance;
  let fee = (method === 'bank') ? 3000 : 2000;
  const totalDeduct = amount + fee;
  if (balance < totalDeduct) return res.status(400).json({ error: 'Saldo tidak cukup' });
  const wdId = 'WD-' + uuidv4().slice(0,8).toUpperCase();
  const newWd = {
    id: wdId, method, accountNumber, accountName: accountName || '-',
    ewalletProvider: ewalletProvider || null,
    amount: parseInt(amount), fee,
    status: 'success',
    createdAt: new Date().toISOString(),
    processedAt: new Date().toISOString()
  };
  db.withdrawals.push(newWd);
  db.balances.totalBalance -= totalDeduct;
  db.balances.totalExpense += totalDeduct;
  writeDB(db);
  res.json({ success: true, withdrawal: newWd });
});
app.post('/api/withdraw/instant', authMiddleware, (req, res) => {
  // Sama seperti manual (bisa dibedakan nanti)
  const { method, accountNumber, accountName, amount, ewalletProvider } = req.body;
  if (!amount || amount < 10000) return res.status(400).json({ error: 'Minimal Rp 10.000' });
  const db = readDB();
  const balance = db.balances.totalBalance;
  let fee = (method === 'bank') ? 3000 : 2000;
  const totalDeduct = amount + fee;
  if (balance < totalDeduct) return res.status(400).json({ error: 'Saldo tidak cukup' });
  const wdId = 'WD-' + uuidv4().slice(0,8).toUpperCase();
  const newWd = {
    id: wdId, method, accountNumber, accountName: accountName || '-',
    ewalletProvider: ewalletProvider || null,
    amount: parseInt(amount), fee,
    status: 'success',
    createdAt: new Date().toISOString(),
    processedAt: new Date().toISOString()
  };
  db.withdrawals.push(newWd);
  db.balances.totalBalance -= totalDeduct;
  db.balances.totalExpense += totalDeduct;
  writeDB(db);
  res.json({ success: true, withdrawal: newWd });
});

// ========== API Docs ==========
app.get('/api/api-docs', authMiddleware, (req, res) => {
  res.json({
    description: 'Dokumentasi API Gateway',
    endpoints: [
      { method: 'POST', path: '/api/auth/login', description: 'Login user' },
      { method: 'POST', path: '/api/auth/register', description: 'Registrasi user' },
      { method: 'GET', path: '/api/user/profile', description: 'Profil user (auth)' },
      { method: 'PUT', path: '/api/user/profile', description: 'Update profil' },
      { method: 'POST', path: '/api/user/regenerate-apikey', description: 'Regenerate API Key' },
      { method: 'GET', path: '/api/dashboard', description: 'Data dashboard (saldo, etc)' },
      { method: 'GET', path: '/api/transactions', description: 'Daftar transaksi (filter status, search)' },
      { method: 'POST', path: '/api/transactions/create', description: 'Buat transaksi QRIS' },
      { method: 'PUT', path: '/api/transactions/:id/status', description: 'Ubah status transaksi (paid/failed)' },
      { method: 'GET', path: '/api/withdrawals', description: 'Daftar penarikan (filter status, search)' },
      { method: 'POST', path: '/api/withdraw', description: 'Penarikan manual' },
      { method: 'POST', path: '/api/withdraw/instant', description: 'Penarikan instan' },
    ]
  });
});

// ========== Root ==========
app.use('/public', express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'api-docs.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'withdrawals.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'transaction.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));