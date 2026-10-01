<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Price Feeds - Admin Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto px-4 py-8" x-data="priceFeedApp()">
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">Live Price Feeds Monitor</h1>
            <p class="text-gray-600">Real-time stock and crypto data from external APIs</p>
        </div>

        <!-- API Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-800">Stock API Status</h3>
                    <div class="flex items-center">
                        <div :class="stockApiStatus === 'active' ? 'bg-green-500' : 'bg-red-500'" class="w-3 h-3 rounded-full mr-2"></div>
                        <span :class="stockApiStatus === 'active' ? 'text-green-600' : 'text-red-600'" class="text-sm font-medium" x-text="stockApiStatus"></span>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mb-2">RapidAPI - Indian Stock Market Data</p>
                <p class="text-xs text-gray-500" x-text="'Last checked: ' + lastChecked"></p>
            </div>

            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-800">Crypto API Status</h3>
                    <div class="flex items-center">
                        <div :class="cryptoApiStatus === 'active' ? 'bg-green-500' : 'bg-red-500'" class="w-3 h-3 rounded-full mr-2"></div>
                        <span :class="cryptoApiStatus === 'active' ? 'text-green-600' : 'text-red-600'" class="text-sm font-medium" x-text="cryptoApiStatus"></span>
                    </div>
                </div>
                <p class="text-sm text-gray-600 mb-2">CoinMarketCap Pro API</p>
                <p class="text-xs text-gray-500" x-text="'Last checked: ' + lastChecked"></p>
            </div>
        </div>

        <!-- Controls -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-8">
            <div class="flex flex-wrap gap-4">
                <button @click="refreshData()" :disabled="loading" class="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg">
                    <span x-show="!loading">Refresh Data</span>
                    <span x-show="loading">Loading...</span>
                </button>
                <button @click="checkApiStatus()" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg">
                    Check API Status
                </button>
                <div class="flex items-center">
                    <label class="mr-2 text-sm text-gray-600">Auto Refresh:</label>
                    <input type="checkbox" x-model="autoRefresh" @change="toggleAutoRefresh()" class="rounded">
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="bg-white rounded-lg shadow-md">
            <div class="border-b border-gray-200">
                <nav class="flex space-x-8 px-6">
                    <button @click="activeTab = 'stocks'" :class="activeTab === 'stocks' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'" class="py-4 px-1 border-b-2 font-medium text-sm">
                        Stock Data
                    </button>
                    <button @click="activeTab = 'crypto'" :class="activeTab === 'crypto' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'" class="py-4 px-1 border-b-2 font-medium text-sm">
                        Crypto Data
                    </button>
                </nav>
            </div>

            <!-- Stock Data Tab -->
            <div x-show="activeTab === 'stocks'" class="p-6">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <template x-for="stock in stocks" :key="stock.symbol">
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" x-text="stock.symbol"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" x-text="stock.name"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" x-text="'₹' + parseFloat(stock.price).toFixed(2)"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm" :class="stock.change_percent >= 0 ? 'text-green-600' : 'text-red-600'" x-text="(stock.change_percent >= 0 ? '+' : '') + parseFloat(stock.change_percent).toFixed(2) + '%'"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" x-text="parseInt(stock.volume).toLocaleString()"></td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span :class="stock.status === 'success' ? 'bg-green-100 text-green-800' : stock.status === 'fallback' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" x-text="stock.status"></span>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Crypto Data Tab -->
            <div x-show="activeTab === 'crypto'" class="p-6">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market Cap</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <template x-for="crypto in cryptos" :key="crypto.symbol">
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" x-text="crypto.symbol"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" x-text="crypto.name"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" x-text="'$' + parseFloat(crypto.price).toFixed(2)"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm" :class="crypto.change_percent >= 0 ? 'text-green-600' : 'text-red-600'" x-text="(crypto.change_percent >= 0 ? '+' : '') + parseFloat(crypto.change_percent).toFixed(2) + '%'"></td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500" x-text="crypto.market_cap ? '$' + parseInt(crypto.market_cap).toLocaleString() : 'N/A'"></td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span :class="crypto.status === 'success' ? 'bg-green-100 text-green-800' : crypto.status === 'fallback' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" x-text="crypto.status"></span>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script>
        function priceFeedApp() {
            return {
                activeTab: 'stocks',
                loading: false,
                autoRefresh: false,
                refreshInterval: null,
                stocks: [],
                cryptos: [],
                stockApiStatus: 'unknown',
                cryptoApiStatus: 'unknown',
                lastChecked: 'Never',

                init() {
                    this.refreshData();
                    this.checkApiStatus();
                },

                async refreshData() {
                    this.loading = true;
                    try {
                        const response = await fetch('/admin/ajax/stock-data');
                        const stockData = await response.json();
                        
                        const cryptoResponse = await fetch('/admin/ajax/crypto-data');
                        const cryptoData = await cryptoResponse.json();
                        
                        this.stocks = stockData || [];
                        this.cryptos = cryptoData || [];
                    } catch (error) {
                        console.error('Error fetching data:', error);
                        // Fallback data
                        this.stocks = [
                            {symbol: 'RELIANCE', name: 'Reliance Industries', price: 2500, change_percent: 1.2, volume: 1000000, status: 'fallback'},
                            {symbol: 'TCS', name: 'Tata Consultancy Services', price: 3200, change_percent: -0.8, volume: 800000, status: 'fallback'}
                        ];
                        this.cryptos = [
                            {symbol: 'BTC', name: 'Bitcoin', price: 45000, change_percent: 2.5, market_cap: 900000000000, status: 'fallback'},
                            {symbol: 'ETH', name: 'Ethereum', price: 3000, change_percent: 1.8, market_cap: 360000000000, status: 'fallback'}
                        ];
                    }
                    this.loading = false;
                },

                async checkApiStatus() {
                    try {
                        // Use local API endpoints
                        const stockResponse = await fetch('/admin/ajax/stock-data');
                        const cryptoResponse = await fetch('/admin/ajax/crypto-data');
                        
                        this.stockApiStatus = stockResponse.ok ? 'active' : 'error';
                        this.cryptoApiStatus = cryptoResponse.ok ? 'active' : 'error';
                        this.lastChecked = new Date().toLocaleTimeString();
                    } catch (error) {
                        console.error('Error checking API status:', error);
                        this.stockApiStatus = 'error';
                        this.cryptoApiStatus = 'error';
                    }
                },

                toggleAutoRefresh() {
                    if (this.autoRefresh) {
                        this.refreshInterval = setInterval(() => {
                            this.refreshData();
                        }, 30000);
                    } else {
                        if (this.refreshInterval) {
                            clearInterval(this.refreshInterval);
                            this.refreshInterval = null;
                        }
                    }
                }
            }
        }
    </script>
</body>
</html>