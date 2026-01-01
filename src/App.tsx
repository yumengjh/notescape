import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Header from "./component/Header/Header";
import Toolbar from "./component/Toolbar/Toolbar";
import Footer from "./component/Footer/Footer";
import Sidebar from "./component/Sidebar/Sidebar";
import { appRoutes, sidebarItems } from "./routes";
import { DataProvider } from "./context/dataContext";

import "./App.css";

const NotFound = lazy(() => import("./pages/NotFound"));

function App() {
  return (
    <DataProvider>
      <div className="dashboard">
        <div className="dashboard-shell">
          <div className="dashboard-sidebar">
            <Sidebar items={sidebarItems} />
          </div>
          <div className="dashboard-main">
            <Header />
            <div className="toolbar-container">
              <Toolbar />
            </div>
            <main className="dashboard-content">
              <Suspense
                fallback={<div className="page-loading">页面加载�?..</div>}
              >
                <Routes>
                  {appRoutes.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={route.element}
                    />
                  ))}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </main>
            <Footer />
          </div>
        </div>
      </div>
    </DataProvider>
  );
}

export default App;
