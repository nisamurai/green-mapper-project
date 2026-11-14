import { minioClient } from "..";

const bucketName = process.env.MINIO_MAIN_BUCKET || "";

export async function createBucketInNotExist(bucket: string = bucketName) {
  const exists = await minioClient.bucketExists(bucket);

  if (!exists) {
    await minioClient.makeBucket(bucket);

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`]
        }
      ]
    };

    await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));

    console.log(`Bucket "${bucket}" created.`);
  }

  return
}

/**
  @param path указывать без слэша в начале!!!
*/
export async function putIntoBucket(
  file: File,
  issueId: number,
  bucket: string = bucketName,
  path: string = "report_photos",
  nextId: () => string = () => crypto.randomUUID(),
) {
  const name = `${path}/${issueId}/${nextId()}.${file.name.split(".").pop()}`;
  const data = await minioClient.putObject(bucket, name, Buffer.from(await file.arrayBuffer()));

  return `/${bucket}/${name}`
}

/**
  @param path указывать без слэша в начале!!!
*/
export async function putIntoBucketMultiple(
  files: File[],
  issueId: number,
  bucket: string = bucketName,
  path: string = "report_photos",
  nextId: () => string = () => crypto.randomUUID(),
) {
  const uploads = files.map(async (file) => putIntoBucket(file, issueId, bucket, path, nextId));
  
  const results = await Promise.allSettled(uploads);
  const successful = results.filter((r) => r.status === 'fulfilled');
  
  if (successful.length !== results.length) {
    await Promise.all(successful.map(r => minioClient.removeObject(bucket, r.value.replace(`${bucket}/`, ''))));
    throw new Error(`Atomic upload failed. ${successful.length} files rolled back.`);
  }
  
  return successful.map(r => r.value);
}

export async function removeFromBucket( path: string, bucket: string = bucketName) {
    await minioClient.removeObject(bucket, path);
    console.log('File deleted successfully:', path);
}
export async function removeFromBucketMultiple( paths: string[], bucket: string = bucketName) {
    minioClient.removeObjects(bucket, paths.map(p => p.replace(`${bucket}/`, '')));
    console.log('Files deleted successfully:', paths);
}