export default function handler(req, res) {
  res.status(200).json({
    email: process.env.ADMIN_EMAIL,
    pass:  process.env.ADMIN_PASS,
  });
}
