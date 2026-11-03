import type { Metadata, Viewport } from 'next';
import './style.css';
export const metadata:Metadata={title:'ShopTrack',description:'Simple inventory and POS',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'ShopTrack',statusBarStyle:'default'}};
export const viewport:Viewport={themeColor:'#173d32',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
