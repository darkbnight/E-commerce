import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { TasksPage } from './pages/TasksPage';
import { ResultsPage } from './pages/ResultsPage';
import { OzonUploadPage } from './pages/OzonUploadPage';
import { ProductDataPrepPage } from './pages/ProductDataPrepPage';
import { ProductContentPage } from './pages/ProductContentPage';
import { ShippingCalculatorPage } from './pages/ShippingCalculatorPage';
import { ShippingRuleInfoPage } from './pages/ShippingRuleInfoPage';
import { ImageCompressionPage } from './pages/ImageCompressionPage';
import './styles.css';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/tasks" replace /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/results', element: <ResultsPage /> },
      { path: '/product-data-prep', element: <ProductDataPrepPage /> },
      { path: '/product-content', element: <ProductContentPage /> },
      { path: '/shipping-calculator', element: <ShippingCalculatorPage /> },
      { path: '/shipping-calculator/rules', element: <ShippingRuleInfoPage /> },
      { path: '/ozon-upload', element: <OzonUploadPage /> },
      { path: '/image-compression', element: <ImageCompressionPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
