/* eslint-disable import/no-extraneous-dependencies */
import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import * as webpack from "webpack";
import { WebpackManifestPlugin } from "webpack-manifest-plugin";
import { InjectManifest } from "workbox-webpack-plugin";

import config from "./webpack/build-config";

type WebpackConfiguration = webpack.Configuration & {
  devServer: Record<string, any>;
};

const plugins: webpack.WebpackPluginInstance[] = [
  new webpack.DefinePlugin({
    "process.env.NODE_ENV": JSON.stringify(config.NODE_ENV),
    "process.env.PHONE_NUMBER_COUNTRY": JSON.stringify(
      config.PHONE_NUMBER_COUNTRY
    )
  }),
  // See: https://github.com/spiritit/timezonecomplete#webpack
  new webpack.ContextReplacementPlugin(
    // eslint-disable-next-line no-useless-escape
    /[\/\\]node_modules[\/\\]timezonecomplete[\/\\]/,
    path.resolve("tz-database-context"),
    {
      tzdata: "tzdata"
    }
  ),
  new NodePolyfillPlugin()
];

if (config.isDevelopment) {
  // plugins.push(new webpack.HotModuleReplacementPlugin());
  plugins.push(new ReactRefreshWebpackPlugin());
}
if (config.isProduction) {
  plugins.push(
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src", "client", "offline.html"),
      filename: "offline.html",
      chunks: ["offline"]
    })
  );

  // Ignore publicPath as we use STATIC_BASE_URL at runtime instead
  plugins.push(
    new WebpackManifestPlugin({
      fileName: config.ASSETS_MAP_FILE,
      publicPath: ""
    })
  );

  plugins.push(
    new InjectManifest({
      swSrc: "./client/service-worker",
      // SW must be served from root, not /assets/, to operate with complete SW scope
      swDest: path.resolve(
        ...(config.isProduction
          ? [config.ASSETS_DIR, "../service-worker.js"]
          : [__dirname])
      ),
      dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      // Bump up the default maximum size (2mb) that's precached,
      // to make lazy-loading failure scenarios less likely.
      // See https://github.com/cra-template/pwa/issues/13#issuecomment-722667270
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
    })
  );
}

const webpackConfig: WebpackConfiguration = {
  mode: config.isProd ? "production" : "development",
  context: path.resolve(__dirname, "src"),
  entry: {
    bundle: "./client/index.tsx"
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    fallback: {
      fs: false,
      net: false,
      tls: false
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        options: {
          plugins: [
            config.isDevelopment && require.resolve("react-refresh/babel")
          ].filter(Boolean)
        }
      },
      // https://github.com/webpack/webpack/issues/11467#issuecomment-691873586
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      },
      {
        test: /\.css$/,
        use: [{ loader: "style-loader" }, { loader: "css-loader" }]
      }
    ]
  },
  plugins,
  optimization: {
    minimize: config.isProduction,
    minimizer: [new TerserPlugin()]
  },
  devtool: config.isProduction ? "hidden-source-map" : "inline-source-map",
  output: {
    filename: config.isProduction ? "[name].[chunkhash].js" : "[name].js",
    path: path.resolve(config.isProduction ? config.ASSETS_DIR : __dirname),
    publicPath: "/assets/"
  },
  // See: https://webpack.js.org/configuration/dev-server/
  devServer: {
    devMiddleware: {
      publicPath: "/assets/",
      stats: "minimal"
    },
    static: {
      directory: "/assets/"
    },
    hot: true,
    allowedHosts: "all",
    headers: { "Access-Control-Allow-Origin": "*" },
    port: config.WEBPACK_PORT || config.PORT,
    proxy: {
      "*": `http://127.0.0.1:${config.DEV_APP_PORT}`
    }
  }
};

export default webpackConfig;
