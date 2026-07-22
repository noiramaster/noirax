import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "noirax-jf2c4ofjb-noira-master.vercel.app",
          },
        ],
        destination: "https://noirax-plum.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
