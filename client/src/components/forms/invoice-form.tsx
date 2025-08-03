import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertTransactionSchema, type InsertTransaction, type Customer, type Product } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, QrCode, Search, Receipt } from "lucide-react";

interface InvoiceFormProps {
  open: boolean;
  onClose: () => void;
}



interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

export default function InvoiceForm({ open, onClose }: InvoiceFormProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastScannedBarcode, setLastScannedBarcode] = useState("");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", productSearch],
    retry: false,
  });

  const { data: scannedProduct, isLoading: barcodeLoading } = useQuery<Product>({
    queryKey: ["/api/products/barcode", lastScannedBarcode],
    enabled: !!lastScannedBarcode,
    retry: false,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    retry: false,
  });

  const form = useForm<InsertTransaction>({
    resolver: zodResolver(insertTransactionSchema),
    defaultValues: {
      customerName: "",
      discount: "0",
      paymentType: "cash",
      currency: "TRY",
    },
  });

  const addItem = (product: Product) => {
    const existingItem = items.find(item => item.productId === product.id);

    if (existingItem) {
      setItems(items.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      const newItem: TransactionItem = {
        id: crypto.randomUUID(),
        transactionId: "",
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: parseFloat(product.price),
        total: parseFloat(product.price),
      };
      setItems([...items, newItem]);
    }
  };

  const handleBarcodeSearch = () => {
    if (!barcodeInput.trim()) return;
    setLastScannedBarcode(barcodeInput.trim());
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBarcodeSearch();
    }
  };

  // Auto-add product when barcode is scanned
  React.useEffect(() => {
    if (scannedProduct) {
      addItem(scannedProduct);
      setBarcodeInput("");
      setLastScannedBarcode("");
    }
  }, [scannedProduct]);

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = parseFloat(form.watch("discount") || "0");
    const total = subtotal - discount;

    return { subtotal, discount, total };
  };

  const getCurrencySymbol = (currency: string) => {
    return currency === "USD" ? "$" : "₺";
  };
  
  const onSubmit = async (data: InsertTransaction) => {
    if (items.length === 0) {
      toast({
        title: "خطأ",
        description: "يجب إضافة منتج واحد على الأقل",
        variant: "destructive",
      });
      return;
    }

    const { total } = calculateTotals();

    const transactionData = {
      ...data,
      total: total.toString(),
      tax: "0", // Always set tax to 0
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || data.customerName || "عميل غير محدد",
    };

    createTransactionMutation.mutate({ transactionData, items });
  };

  const createTransactionMutation = useMutation({
    mutationFn: async ({ transactionData, items }: { transactionData: InsertTransaction; items: TransactionItem[] }) => {
      return await apiRequest("POST", "/api/transactions", { transaction: transactionData, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "تم بنجاح",
        description: "تم إنشاء الفاتورة بنجاح",
      });
      form.reset();
      setItems([]);
      onClose();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إنشاء الفاتورة",
        variant: "destructive",
      });
    },
  });

  const totals = calculateTotals();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            إنشاء فاتورة جديدة
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Barcode Scanner */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                قراءة سريعة بالباركود
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="امسح أو أدخل الباركود..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeKeyPress}
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleBarcodeSearch}
                  disabled={barcodeLoading || !barcodeInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {barcodeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {lastScannedBarcode && !scannedProduct && !barcodeLoading && (
                <p className="text-sm text-red-600 mt-2">لم يتم العثور على المنتج</p>
              )}
            </CardContent>
          </Card>

          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle>معلومات العميل</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اختيار عميل موجود</Label>
                  <Select onValueChange={(value) => setSelectedCustomer(customers.find((c) => c.id === value) || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر عميل" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers
                        .filter((customer) => customer.name.toLowerCase().includes(customerSearch.toLowerCase()))
                        .map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="search"
                    placeholder="ابحث عن عميل..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerName">اسم العميل *</Label>
                  <Input
                    id="customerName"
                    placeholder="أدخل اسم العميل"
                    {...form.register("customerName")}
                    className="text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>العملة</Label>
                  <Select onValueChange={(value) => form.setValue("currency", value as "TRY" | "USD")}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر العملة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRY">ليرة تركية (₺)</SelectItem>
                      <SelectItem value="USD">دولار أمريكي ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>نوع الدفع</Label>
                  <Select onValueChange={(value) => form.setValue("paymentType", value as "cash" | "credit")}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نوع الدفع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقد</SelectItem>
                      <SelectItem value="credit">دين</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                المنتجات
                <Button size="sm" onClick={() => setProductSearch("")}>
                  <Plus className="w-4 h-4 ml-2" />
                  إضافة منتج
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input
                  type="search"
                  placeholder="ابحث عن منتج..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {products
                    .filter((product) => product.name.toLowerCase().includes(productSearch.toLowerCase()))
                    .map((product) => (
                      <Button
                        key={product.id}
                        variant="outline"
                        className="justify-start text-sm"
                        onClick={() => addItem(product)}
                      >
                        {product.name} - {product.price} {getCurrencySymbol(form.watch("currency") || "TRY")}
                      </Button>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>العناصر</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border rounded-md p-2">
                    <span>
                      {item.productName} × {item.quantity}
                    </span>
                    <span>{item.total.toFixed(2)} {getCurrencySymbol(form.watch("currency") || "TRY")}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="text-red-500 hover:bg-red-50"
                      onClick={() => setItems(items.filter((i) => i.id !== item.id))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {items.length === 0 && <p className="text-center">لا توجد عناصر مضافة.</p>}
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardHeader>
              <CardTitle>الإجماليات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount">الخصم (اختياري)</Label>
                  <Input
                    id="discount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...form.register("discount")}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-medium">{totals.subtotal.toFixed(2)} {getCurrencySymbol(form.watch("currency") || "TRY")}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between">
                    <span>الخصم:</span>
                    <span className="font-medium text-red-600">-{totals.discount.toFixed(2)} {getCurrencySymbol(form.watch("currency") || "TRY")}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>المجموع النهائي:</span>
                  <span>{totals.total.toFixed(2)} {getCurrencySymbol(form.watch("currency") || "TRY")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              إلغاء
            </Button>
            <Button type="submit" disabled={createTransactionMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {createTransactionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              إنشاء الفاتورة
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}