import { AuthProvider } from "@/context/AuthProvider";

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
		<AuthProvider>
			{children}
		</AuthProvider>
    );
}