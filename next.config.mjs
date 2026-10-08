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
        ];
    },

    async redirects() {
        return [
            {
                source: '/advisor-analysis',
                destination: '/daily-advisor-shadow',
                permanent: true,
            },
            {
                source: '/research',
                destination: '/daily-advisor-shadow',
                permanent: true,
            },
        ];
    },

    // Exclude statistics files from serverless function bundles to avoid exceeding size limit
    outputFileTracingExcludes: {
        '*': [
            'lib/data/statistics/**/*',
        ],
    },
};

export default nextConfig;
