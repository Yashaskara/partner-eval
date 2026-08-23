import { checkDailyLimit } from '../llm/meter.js';

export async function checkTokenLimit(req, res, next) {
  try {
    const status = await checkDailyLimit(req.user.id);
    if (status.exceeded) {
      return res.status(429).json({
        error: 'Daily token limit exceeded. Try again tomorrow.',
        used: status.used,
        limit: status.limit,
      });
    }
    req.tokenStatus = status;
    next();
  } catch (e) {
    console.error('Token limit check error:', e);
    next();
  }
}
