import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadingOutlined } from "@ant-design/icons";
import Header from "./component/Header/Header";
import Toolbar from "./component/Toolbar/Toolbar";
import Footer from "./component/Footer/Footer";
import Sidebar from "./component/Sidebar/Sidebar";
import { appRoutes, sidebarItems } from "./routes";
import { DataProvider } from "./context/dataContext";
import { DocumentProvider } from "./context/documentContext";
import { EditProvider, useEditContext } from "./context/editContext";

import "./App.css";

const NotFound = lazy(() => import("./pages/NotFound"));

function AppContent() {
  const { isEditing } = useEditContext();
  
  return (
    <div className="dashboard">
      <div className="dashboard-shell">
        <div className="dashboard-sidebar">
          <Sidebar items={sidebarItems} />
        </div>
        <div className="dashboard-main">
          <Header />
          {isEditing && (
            <div className="toolbar-container">
              <Toolbar />
            </div>
          )}
          <main className="dashboard-content">
                <Suspense
                  fallback={
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "center", 
                      alignItems: "center", 
                      minHeight: "200px" 
                    }}>
                      <LoadingOutlined style={{ fontSize: 24, color: "#1890ff" }} spin />
                    </div>
                  }
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
  );
}

function App() {
  return (
    <DataProvider>
      <DocumentProvider>
        <EditProvider>
          <AppContent />
        </EditProvider>
      </DocumentProvider>
    </DataProvider>
  );
}

export default App;
