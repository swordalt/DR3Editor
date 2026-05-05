export const getFileExtension = (file: File) => {
  const extension = file.name.split('.').pop();
  return extension && extension !== file.name ? extension : 'bin';
};

export const formatByteSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
};

export const formatFileSize = (file: File | null) => {
  if (!file) return '';

  return formatByteSize(file.size);
};
