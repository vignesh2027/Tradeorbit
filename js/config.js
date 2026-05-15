export const CONFIG = {
  finnhub: {
    apiKey: 'd83lgm1r01qkm5c8ki20d83lgm1r01qkm5c8ki2g',
    wsUrl:   'wss://ws.finnhub.io',
    rest:    'https://finnhub.io/api/v1'
  },
  alphaVantage: {
    apiKey:  'K1TSG30N5WSSYMFN',
    base:    'https://www.alphavantage.co/query'
  },
  gnews: {
    apiKey:  '12ba9460a19105a7fcbc8abb06798e7e',
    base:    'https://gnews.io/api/v4'
  },
  newsdata: {
    apiKey:  'pub_50445c4a6b894de2acf13e3f601980bf',
    base:    'https://newsdata.io/api/1'
  },
  firebase: {
    apiKey:            'AIzaSyB-RnZS3XP135skUptGrT1AQaJjLVeVwhs',
    authDomain:        'tradeorbit-e6b70.firebaseapp.com',
    databaseURL:       'https://tradeorbit-e6b70-default-rtdb.firebaseio.com',
    projectId:         'tradeorbit-e6b70',
    storageBucket:     'tradeorbit-e6b70.firebasestorage.app',
    messagingSenderId: '881561365997',
    appId:             '1:881561365997:web:093b36ccdd1f0baa200be4'
  },
  binance: {
    ws:   'wss://stream.binance.com:9443/ws',
    rest: 'https://api.binance.com/api/v3'
  },
  textures: {
    day:    'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/2_no_clouds_4k.jpg',
    night:  'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/5_night_4k.jpg',
    clouds: 'https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png'
  }
};

export const TRADE_CITIES = [
  { name:'Shanghai',    country:'China',      lat: 31.2, lng: 121.5, traffic:47.0, ships:320 },
  { name:'Ningbo',      country:'China',      lat: 29.9, lng: 121.6, traffic:33.4, ships:280 },
  { name:'Shenzhen',    country:'China',      lat: 22.5, lng: 113.9, traffic:28.8, ships:265 },
  { name:'Guangzhou',   country:'China',      lat: 22.3, lng: 113.6, traffic:26.4, ships:241 },
  { name:'Qingdao',     country:'China',      lat: 36.1, lng: 120.4, traffic:25.7, ships:210 },
  { name:'Singapore',   country:'Singapore',  lat:  1.3, lng: 103.8, traffic:37.2, ships:300 },
  { name:'Busan',       country:'S. Korea',   lat: 35.1, lng: 129.0, traffic:22.1, ships:198 },
  { name:'Hong Kong',   country:'China',      lat: 22.3, lng: 114.2, traffic:19.6, ships:180 },
  { name:'Tianjin',     country:'China',      lat: 39.1, lng: 117.2, traffic:18.3, ships:165 },
  { name:'Rotterdam',   country:'Netherlands',lat: 51.9, lng:   4.5, traffic:14.5, ships:155 },
  { name:'Dubai',       country:'UAE',        lat: 25.2, lng:  55.3, traffic:13.5, ships:148 },
  { name:'Klang',       country:'Malaysia',   lat:  3.0, lng: 101.4, traffic:13.2, ships:140 },
  { name:'Antwerp',     country:'Belgium',    lat: 51.2, lng:   4.4, traffic:11.1, ships:112 },
  { name:'Long Beach',  country:'USA',        lat: 33.8, lng:-118.2, traffic: 9.5, ships: 98 },
  { name:'Los Angeles', country:'USA',        lat: 33.7, lng:-118.3, traffic:11.5, ships:105 },
  { name:'Hamburg',     country:'Germany',    lat: 53.5, lng:  10.0, traffic: 8.7, ships: 92 },
  { name:'Tokyo',       country:'Japan',      lat: 35.7, lng: 139.7, traffic:14.2, ships:150 },
  { name:'Mumbai',      country:'India',      lat: 19.1, lng:  72.9, traffic: 7.2, ships: 78 },
  { name:'New York',    country:'USA',        lat: 40.7, lng: -74.0, traffic:12.8, ships:120 },
  { name:'Colombo',     country:'Sri Lanka',  lat:  6.9, lng:  79.9, traffic: 5.8, ships: 62 },
  { name:'Vancouver',   country:'Canada',     lat: 49.3, lng:-123.1, traffic: 3.5, ships: 42 },
  { name:'Savannah',    country:'USA',        lat: 32.1, lng: -81.1, traffic: 5.9, ships: 60 },
  { name:'Felixstowe',  country:'UK',         lat: 51.9, lng:   1.3, traffic: 4.1, ships: 48 },
  { name:'Barcelona',   country:'Spain',      lat: 41.4, lng:   2.2, traffic: 3.5, ships: 40 },
  { name:'Valencia',    country:'Spain',      lat: 39.5, lng:  -0.3, traffic: 5.4, ships: 58 },
  { name:'Piraeus',     country:'Greece',     lat: 37.9, lng:  23.6, traffic: 5.6, ships: 60 },
  { name:'Cape Town',   country:'S. Africa',  lat:-33.9, lng:  18.4, traffic: 1.1, ships: 20 },
  { name:'Sydney',      country:'Australia',  lat:-33.9, lng: 151.2, traffic: 2.7, ships: 35 },
  { name:'Durban',      country:'S. Africa',  lat:-29.9, lng:  31.0, traffic: 2.3, ships: 28 },
  { name:'New Orleans', country:'USA',        lat: 30.0, lng: -90.1, traffic: 6.3, ships: 66 },
];

export const TRADE_ROUTES = [
  { from:'Shanghai',   to:'Los Angeles',  weight:5.0 },
  { from:'Shanghai',   to:'Rotterdam',    weight:4.2 },
  { from:'Shanghai',   to:'Long Beach',   weight:4.5 },
  { from:'Shanghai',   to:'New York',     weight:3.5 },
  { from:'Shanghai',   to:'Singapore',    weight:4.0 },
  { from:'Shanghai',   to:'Tokyo',        weight:3.2 },
  { from:'Singapore',  to:'Rotterdam',    weight:3.0 },
  { from:'Singapore',  to:'Dubai',        weight:3.5 },
  { from:'Singapore',  to:'Mumbai',       weight:2.5 },
  { from:'Singapore',  to:'Sydney',       weight:2.0 },
  { from:'Rotterdam',  to:'New York',     weight:3.0 },
  { from:'Rotterdam',  to:'Hamburg',      weight:2.0 },
  { from:'Hamburg',    to:'New York',     weight:2.5 },
  { from:'Dubai',      to:'Mumbai',       weight:3.0 },
  { from:'Dubai',      to:'Rotterdam',    weight:2.8 },
  { from:'Tokyo',      to:'Los Angeles',  weight:3.5 },
  { from:'Busan',      to:'Los Angeles',  weight:3.0 },
  { from:'Hong Kong',  to:'Los Angeles',  weight:3.0 },
  { from:'Tianjin',    to:'Rotterdam',    weight:2.5 },
  { from:'Mumbai',     to:'Rotterdam',    weight:2.0 },
];

export const SYMBOLS = {
  BTC:    { label:'Bitcoin',       unit:'USD',  type:'crypto', binance:'BTCUSDT', finnhub:'BINANCE:BTCUSDT' },
  ETH:    { label:'Ethereum',      unit:'USD',  type:'crypto', binance:'ETHUSDT', finnhub:'BINANCE:ETHUSDT' },
  GOLD:   { label:'Gold',          unit:'USD',  type:'commodity', finnhub:'OANDA:XAU_USD', av:'COMMODITY', avSym:'XAU' },
  OIL:    { label:'Crude Oil WTI', unit:'USD',  type:'commodity', finnhub:'OANDA:WTICO_USD', av:'BRENT' },
  SPX:    { label:'S&P 500',       unit:'pts',  type:'index',     finnhub:'SPY',  av:'SPY' },
  EURUSD: { label:'EUR / USD',     unit:'',     type:'forex',     finnhub:'OANDA:EUR_USD', av:'EUR', avTo:'USD' },
};

export const TRADE_KEYWORDS = [
  'tariff','sanction','export','import','WTO','OPEC','supply chain',
  'trade war','freight','shipping','container','customs','quota',
  'embargo','duty','bilateral','multilateral','G20','G7',
  'inflation','recession','GDP','Fed','ECB','BRICS','port',
  'logistics','semiconductor','rare earth','LNG','crude'
];
