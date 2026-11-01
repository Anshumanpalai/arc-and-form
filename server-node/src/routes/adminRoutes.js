import { Router } from 'express';
import { AdminService } from '../services/adminService.js';
import { AdminProductService } from '../services/adminProductService.js';
import { OrderService } from '../services/orderService.js';
import { CloudinaryService } from '../services/cloudinaryService.js';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';
import { handleImageUpload } from '../middleware/uploadMiddleware.js';

const router = Router();

// Protect all storefront admin endpoints
router.use(authenticate, requireAdmin);

// -----------------------------------------------------------------------------
// Admin Dashboard Overview & Metrics
// -----------------------------------------------------------------------------
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await AdminService.getSummary();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

// Alias for /summary matching alternative convention
router.get('/dashboard', async (req, res, next) => {
  try {
    const summary = await AdminService.getSummary();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Admin Order Management
// -----------------------------------------------------------------------------
router.get('/orders', async (req, res, next) => {
  try {
    const page = await AdminService.getOrders(req.query);
    res.status(200).json(page);
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await AdminService.getOrderById(req.params.id);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
});

router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const order = await AdminService.updateOrderStatus(req.params.id, req.body);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:id/return', async (req, res, next) => {
  try {
    const order = await AdminService.processOrderReturn(req.params.id, req.body);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
});

router.post('/orders/reconcile-refunds', async (req, res, next) => {
  try {
    const thresholdMinutes = Number(req.body?.thresholdMinutes) || 15;
    const stats = await OrderService.recoverStalePendingRefunds({ thresholdMinutes });
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Cloudinary Image Upload & Asset Management
// -----------------------------------------------------------------------------
router.post('/uploads/image', handleImageUpload, async (req, res, next) => {
  try {
    const uploadResult = await CloudinaryService.uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.status(201).json(uploadResult);
  } catch (err) {
    next(err);
  }
});

router.delete('/uploads/image/:publicId', async (req, res, next) => {
  try {
    const deleteResult = await CloudinaryService.deleteImage(req.params.publicId);
    res.status(200).json(deleteResult);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Admin Product Catalog Management
// -----------------------------------------------------------------------------
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

