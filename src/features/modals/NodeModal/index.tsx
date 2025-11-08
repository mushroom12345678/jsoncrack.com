import React, { useState, useEffect } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea, Group, TextInput, NumberInput } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { toast } from "react-hot-toast";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// Convert node data to JSON while preserving nested structures
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";

  // Process a nested array or object string value
  const processNestedValue = (value: string, type: string) => {
    try {
      if (typeof value === "string") {
        // Try to parse the string as JSON
        const parsed = JSON.parse(value);
        return parsed;
      }
      return type === "array" ? [] : {};
    } catch {
      return type === "array" ? [] : {};
    }
  };

  // Build the object structure
  const result = {};
  const processRows = (rows: NodeData["text"]) => {
    rows?.forEach(row => {
      if (!row.key) return;

      if (row.type === "object") {
        result[row.key] = processNestedValue(row.value as string, "object");
      } else if (row.type === "array") {
        result[row.key] = processNestedValue(row.value as string, "array");
      } else {
        // For primitive values, try to parse if it looks like JSON
        try {
          if (typeof row.value === "string" && 
              (row.value.startsWith("{") || row.value.startsWith("["))) {
            result[row.key] = JSON.parse(row.value);
          } else {
            result[row.key] = row.value;
          }
        } catch {
          result[row.key] = row.value;
        }
      }
    });
  };

  processRows(nodeRows);
  return JSON.stringify(result, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Update node data in the JSON structure
const updateNodeInJson = (json: string, path: NodeData["path"], newData: any): string => {
  try {
    const jsonObj = JSON.parse(json);
    
    // Handle case where path is undefined or empty
    if (!path || path.length === 0) {
      return JSON.stringify(newData, null, 2);
    }

    // Function to traverse and update the JSON object
    const updateNode = (obj: any, pathArr: (string | number)[]) => {
      if (pathArr.length === 0) return obj;
      
      const [current, ...rest] = pathArr;
      if (rest.length === 0) {
        // We've reached the target node
        if (Array.isArray(obj)) {
          const existingData = obj[current as number] || {};
          obj[current as number] = {
            ...existingData,
            ...newData
          };
        } else {
          if (typeof obj[current as string] === 'object' && !Array.isArray(obj[current as string])) {
            obj[current as string] = {
              ...obj[current as string],
              ...newData
            };
          } else {
            obj[current as string] = newData;
          }
        }
      } else {
        // Keep traversing
        if (Array.isArray(obj)) {
          obj[current as number] = updateNode(obj[current as number] || {}, rest);
        } else {
          obj[current as string] = updateNode(obj[current as string] || {}, rest);
        }
      }
      return obj;
    };

    // Update the JSON object
    updateNode(jsonObj, path);
    return JSON.stringify(jsonObj, null, 2);
  } catch (error) {
    console.error("Failed to update JSON:", error);
    return json;
  }
};

interface FormData {
  name: string;
  color: string;
  details: {
    type: string;
    season: string;
  };
  nutrients: {
    calories: number;
    fiber: string;
    vitaminC?: string;
    potassium?: string;
    antioxidants?: string;
  };
}

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const { getJson, setJson } = useJson();
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState("");
  const [formData, setFormData] = useState<FormData>({
    name: "",
    color: "",
    details: {
      type: "",
      season: ""
    },
    nutrients: {
      calories: 0,
      fiber: "",
    }
  });

  useEffect(() => {
    if (nodeData?.text) {
      const data = JSON.parse(normalizeNodeData(nodeData.text));
      setFormData({
        name: data.name || "",
        color: data.color || "",
        details: {
          type: data.details?.type || "",
          season: data.details?.season || "",
        },
        nutrients: {
          calories: data.nutrients?.calories || 0,
          fiber: data.nutrients?.fiber || "",
          vitaminC: data.nutrients?.vitaminC || "",
          potassium: data.nutrients?.potassium || "",
          antioxidants: data.nutrients?.antioxidants || "",
        }
      });
    }
  }, [nodeData]);

  const handleChange = (section: string, field: string, value: string | number) => {
    setFormData(prev => {
      if (section === "root") {
        return { ...prev, [field]: value };
      }
      
      const updatedSection = section as keyof FormData;
      if (updatedSection === "details") {
        return {
          ...prev,
          details: {
            ...prev.details,
            [field]: value
          }
        };
      } else if (updatedSection === "nutrients") {
        return {
          ...prev,
          nutrients: {
            ...prev.nutrients,
            [field]: value
          }
        };
      }
      return prev;
    });
  };
  
  const handleEdit = () => {
    const initialValue = normalizeNodeData(nodeData?.text ?? []);
    console.log('Initial node data:', nodeData?.text);
    console.log('Normalized value:', initialValue);
    setEditedValue(initialValue);
    setIsEditing(true);
  };

  const handleSave = () => {
    try {
      if (!nodeData?.path) {
        toast.error("No node selected to update");
        return;
      }

      // Use formData as the new data
      let newData = {
        ...formData,
        // Only include optional properties if they have values
        nutrients: {
          ...formData.nutrients,
          ...(formData.nutrients.vitaminC && { vitaminC: formData.nutrients.vitaminC }),
          ...(formData.nutrients.potassium && { potassium: formData.nutrients.potassium }),
          ...(formData.nutrients.antioxidants && { antioxidants: formData.nutrients.antioxidants })
        }
      };

      // Get current JSON and merge with existing data
      const currentJson = getJson();
      try {
        const existingData = JSON.parse(currentJson);
        let current = existingData;
        let parent: any = null;
        let lastKey: string | number | null = null;
        
        // Navigate to the target node
        for (let i = 0; i < nodeData.path.length; i++) {
          const key = nodeData.path[i];
          if (i === nodeData.path.length - 1) {
            parent = current;
            lastKey = key;
          } else {
            current = current[key];
          }
        }
        
        // Deep merge with existing data if it's an object
        if (parent && lastKey !== null) {
          const existing = parent[lastKey];
          if (typeof existing === 'object' && !Array.isArray(existing) && existing !== null) {
            // Deep merge objects
            const mergedData = { ...newData };
            
            // Merge nested objects
            Object.keys(existing).forEach(key => {
              if (
                typeof existing[key] === 'object' && 
                existing[key] !== null && 
                !Array.isArray(existing[key]) &&
                typeof mergedData[key] === 'object' &&
                mergedData[key] !== null
              ) {
                mergedData[key] = {
                  ...existing[key],
                  ...mergedData[key]
                };
              } else if (!(key in mergedData)) {
                mergedData[key] = existing[key];
              }
            });
            
            newData = mergedData;
          }
        }
      } catch (error) {
        console.warn('Could not merge with existing data:', error);
      }

      // Update JSON with merged data
      const updatedJson = updateNodeInJson(currentJson, nodeData.path, newData);

      // Update file contents first
      useFile.getState().setContents({
        contents: updatedJson,
        hasChanges: true,
        skipUpdate: false
      });

      // Then update JSON store and graph
      setJson(updatedJson);
      useGraph.getState().setGraph(updatedJson);

      setIsEditing(false);
      onClose();
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Failed to save changes:", error);
      toast.error("Failed to save changes. Please check your JSON format.");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedValue("");
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          <ScrollArea.Autosize mah={400} maw={600}>
            {isEditing ? (
              <Stack gap="md" style={{ padding: '10px' }}>
                {/* Basic Info */}
                <TextInput
                  label="Name"
                  value={formData.name}
                  onChange={(e) => handleChange("root", "name", e.target.value)}
                />
                <TextInput
                  label="Color"
                  value={formData.color}
                  onChange={(e) => handleChange("root", "color", e.target.value)}
                />
                
                {/* Details Section */}
                <Text fw={500} size="sm">Details</Text>
                <Group grow>
                  <TextInput
                    label="Type"
                    value={formData.details.type}
                    onChange={(e) => handleChange("details", "type", e.target.value)}
                  />
                  <TextInput
                    label="Season"
                    value={formData.details.season}
                    onChange={(e) => handleChange("details", "season", e.target.value)}
                  />
                </Group>

                {/* Nutrients Section */}
                <Text fw={500} size="sm">Nutrients</Text>
                <Group grow>
                  <NumberInput
                    label="Calories"
                    value={formData.nutrients.calories}
                    onChange={(val) => handleChange("nutrients", "calories", val || 0)}
                  />
                  <TextInput
                    label="Fiber"
                    value={formData.nutrients.fiber}
                    onChange={(e) => handleChange("nutrients", "fiber", e.target.value)}
                  />
                </Group>
                <Group grow>
                  <TextInput
                    label="Vitamin C"
                    value={formData.nutrients.vitaminC || ""}
                    onChange={(e) => handleChange("nutrients", "vitaminC", e.target.value)}
                  />
                  <TextInput
                    label="Potassium"
                    value={formData.nutrients.potassium || ""}
                    onChange={(e) => handleChange("nutrients", "potassium", e.target.value)}
                  />
                </Group>
                <TextInput
                  label="Antioxidants"
                  value={formData.nutrients.antioxidants || ""}
                  onChange={(e) => handleChange("nutrients", "antioxidants", e.target.value)}
                />
              </Stack>
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
        <Group justify="flex-end" mt="md">
          {!isEditing ? (
            <Button onClick={handleEdit} size="sm">
              Edit
            </Button>
          ) : (
            <>
              <Button onClick={handleCancel} variant="light" color="red" size="sm">
                Cancel
              </Button>
              <Button onClick={handleSave} size="sm">
                Save
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};