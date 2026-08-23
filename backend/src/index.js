import app from './app.js';

const PORT = process.env.BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Anvaya backend listening on http://localhost:${PORT}`);
});
