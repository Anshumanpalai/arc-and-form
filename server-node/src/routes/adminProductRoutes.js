import { Router } from 'express';
import { AdminProductService } from '../services/adminProductService.js';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all admin product routes
router.use(authenticate, requireAdmin);

router.get('/products', async (req, res, next) => {
  try {
    const page = await AdminProductService.getProducts(req.query);
    res.status(200).json(page);
  } catch (err) {
    next(err);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const product = await AdminProductService.createProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const product = await AdminProductService.updateProduct(req.params.id, req.body);
    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    await AdminProductService.deleteProduct(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;

