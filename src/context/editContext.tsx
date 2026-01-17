import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface EditContextType {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  toggleEditing: () => void;
}

const EditContext = createContext<EditContextType | null>(null);

export const useEditContext = () => {
  const context = useContext(EditContext);
  if (!context) {
    throw new Error("useEditContext must be used within EditProvider");
  }
  return context;
};

export const EditProvider = ({ children }: { children: ReactNode }) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const toggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  return (
    <EditContext.Provider
      value={{
        isEditing,
        setIsEditing,
        toggleEditing,
      }}
    >
      {children}
    </EditContext.Provider>
  );
};
