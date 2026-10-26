import { useEffect, useState } from "react";
import type {
  RazorpayOrder,
  RazorpayPaymentResponse,
} from "@/lib/api";
import { getRazorpayPublicKey } from "@/lib/api";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type RazorpayCheckoutProps = {
  order: RazorpayOrder;
  user?: {
    name?: string;
    email?: string;
  };
  verifyPayment: (response: RazorpayPaymentResponse) => unknown | Promise<unknown>;
  onSuccess?: (result: unknown) => void | Promise<void>;
  onError?: (error: Error) => void;
  className?: string;
  autoOpen?: boolean;
};

export function RazorpayCheckout({
  order,
  user,
  verifyPayment,
  onSuccess,
  onError,
  className,
  autoOpen = false,
}: RazorpayCheckoutProps) {
  const [isOpening, setIsOpening] = useState(false);

  const openCheckout = async () => {
    setIsOpening(true);
    const publicEnv = (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env;
    let key = (
      publicEnv?.BUN_PUBLIC_RAZORPAY_KEY_ID ??
      (typeof process !== "undefined"
        ? process.env.BUN_PUBLIC_RAZORPAY_KEY_ID
        : undefined)
    )?.trim();
    try {
      key ||= await getRazorpayPublicKey();
    } catch {
      setIsOpening(false);
      onError?.(new Error("Razorpay public key is not configured."));
      return;
    }

    if (!window.Razorpay) {
      setIsOpening(false);
      onError?.(new Error("Razorpay Checkout has not loaded yet."));
      return;
    }

    const checkout = new window.Razorpay({
      key,
      amount: order.amount,
      currency: order.currency,
      name: "Quill AI",
      order_id: order.id,
      prefill: user,
      handler: async (response) => {
        try {
          const verification = await verifyPayment(response);
          await onSuccess?.(verification);
        } catch (error) {
          onError?.(
            error instanceof Error
              ? error
              : new Error("Unable to verify Razorpay payment."),
          );
        } finally {
          setIsOpening(false);
        }
      },
      modal: {
        ondismiss: () => setIsOpening(false),
      },
    });

    checkout.on("payment.failed", () => {
      setIsOpening(false);
      onError?.(new Error("Razorpay payment failed."));
    });
    checkout.open();
  };

  useEffect(() => {
    if (autoOpen) openCheckout();
  }, [autoOpen, order.id]);

  return (
    <button
      type="button"
      className={className}
      onClick={openCheckout}
      disabled={isOpening}
    >
      {isOpening ? "Opening checkout..." : "Pay with Razorpay"}
    </button>
  );
}
