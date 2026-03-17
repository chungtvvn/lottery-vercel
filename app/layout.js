export const metadata = {
    title: 'Lottery Stats - Thống kê Xổ số Miền Bắc',
    description: 'Công cụ thống kê và phân tích xổ số miền Bắc',
};

export default function RootLayout({ children }) {
    return (
        <html lang="vi">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>{children}</body>
        </html>
    );
}
