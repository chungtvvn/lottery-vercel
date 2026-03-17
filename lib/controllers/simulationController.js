// controllers/simulationController.js
const simulationService = require('../services/simulationService');
const lotteryService = require('../services/lotteryService'); // Import lotteryService

/**
 * Xử lý yêu cầu chạy mô phỏng.
 * @param {object} req - Đối tượng request từ Express.
 * @param {object} res - Đối tượng response từ Express.
 */
const runSimulationController = async (req, res) => {
    try {
        const options = req.body;

        // Lấy dữ liệu đã cache từ lotteryService
        const rawData = lotteryService.getRawData();

        if (!rawData || rawData.length === 0) {
            return res.status(500).json({ error: 'Dữ liệu xổ số chưa được tải. Vui lòng khởi động lại server.' });
        }

        // Truyền dữ liệu vào simulationService
        const result = await simulationService.runSimulation(options, rawData);

        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    runSimulationController
};