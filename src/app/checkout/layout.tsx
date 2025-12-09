import Script from "next/script";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Script
        src="https://www.mercadopago.com/v2/security.js"
        //@ts-ignore
        view="checkout"
        output="deviceId"
      ></Script>
      <Script src="https://sdk.mercadopago.com/js/v2"></Script>
      {children}
    </>
  );
}