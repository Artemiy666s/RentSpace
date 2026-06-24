const express = require('express');
const healthRoutes = require('./health');
const authRoutes = require('./auth');
const propertiesRoutes = require('./properties');
const mapRoutes = require('./map');
const roomsRoutes = require('./rooms');
const tenantsRoutes = require('./tenants');
const contractsRoutes = require('./contracts');
const financeRoutes = require('./finance');
const dashboardRoutes = require('./dashboard');
const reportsRoutes = require('./reports');
const importRoutes = require('./import');
const activityRoutes = require('./activity');
const serviceRequestsRoutes = require('./serviceRequests');
const managerRoutes = require('./manager');
const orgUsersRoutes = require('./orgUsers');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
// Public map assets (signed URLs) must run before routers that apply authenticate to all paths.
router.use('/', mapRoutes.publicRouter);
router.use('/', propertiesRoutes);
router.use('/', mapRoutes);
router.use('/rooms', roomsRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/contracts', contractsRoutes);
router.use('/', financeRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/import', importRoutes);
router.use('/activity', activityRoutes);
router.use('/service-requests', serviceRequestsRoutes);
router.use('/manager', managerRoutes);
router.use('/org', orgUsersRoutes);

module.exports = router;
