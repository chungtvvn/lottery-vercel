/** @type {import('next').NextConfig} */
const nextConfig = {
    // Rewrites: Map API paths cũ → API paths mới
    // Giúp client-side JS KHÔNG cần thay đổi bất kỳ fetch URL nào
    async rewrites() {
        return [
            // Statistics API v2 → new API routes
            { source: '/statistics/api/v2/quick-stats', destination: '/api/statistics/quick-stats' },
            { source: '/statistics/api/v2/quick-stats-history', destination: '/api/statistics/quick-stats-history' },
            { source: '/statistics/api/v2/stats', destination: '/api/statistics/stats' },
            { source: '/statistics/api/v2/potential-streaks', destination: '/api/statistics/potential-streaks' },

            // Distribution API
            { source: '/api/distribution/all', destination: '/api/distribution/all' },
            { source: '/api/distribution/heatmap', destination: '/api/distribution/heatmap' },
            { source: '/api/distribution/predictions', destination: '/api/distribution/predictions' },
            { source: '/api/distribution/categories', destination: '/api/distribution/categories' },
            { source: '/api/distribution/cached-predictions', destination: '/api/distribution/cached-predictions' },
            { source: '/api/distribution/category/:category', destination: '/api/distribution/category/:category' },

            // Prediction API
            { source: '/api/prediction/daily', destination: '/api/prediction/daily' },
            { source: '/api/prediction/advanced', destination: '/api/prediction/advanced' },
            { source: '/api/prediction/yearly-comparison', destination: '/api/prediction/yearly-comparison' },
            { source: '/api/prediction/ai-prompt', destination: '/api/prediction/ai-prompt' },
            { source: '/api/prediction/config', destination: '/api/prediction/config' },
            { source: '/api/prediction/number/:number', destination: '/api/prediction/number/:number' },

            // Streak backtest
            { source: '/api/streak-backtest', destination: '/api/streak-backtest' },
        ];
    },

    // Increase serverless function timeout (Vercel Pro only, otherwise ignored)
    serverExternalPackages: [],
};

export default nextConfig;
