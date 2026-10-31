import { Router } from 'express';
import { CatalogService } from '../services/catalogService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await CatalogService.getProducts(req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const result = await CatalogService.getProductBySlug(req.params.slug);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

