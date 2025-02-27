const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const multer = require("multer");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
const upload = multer({ storage: multer.memoryStorage() });

/** ✅ 1. Hello World Function */
exports.helloWorld = onRequest((req, res) => {
  console.log("✅ HelloWorld function triggered!");
  logger.info("Hello logs!", { structuredData: true });
  res.send("Hello from Firebase!");
});

/** ✅ 2. Firestore Trigger - Detects new user additions */
exports.newUserAdded = onDocumentCreated("users/{userId}", (event) => {
  console.log("🆕 New user added:", event.data.data());
});

/** ✅ 3. Upload Image to Firebase Storage */
exports.uploadImage = onRequest((req, res) => {
  console.log("📥 Upload Image function triggered");

  if (req.method !== "POST") {
    console.log("❌ Invalid request method:", req.method);
    return res.status(405).send("Only POST requests are allowed");
  }

  upload.single("image")(req, res, async (err) => {
    if (err || !req.file) {
      console.log("❌ Error uploading file or no file provided:", err);
      return res.status(400).send("Error uploading file or no file provided.");
    }

    const bucket = admin.storage().bucket();
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `images/${fileName}`;
    const file = bucket.file(filePath);

    try {
      console.log("📤 Saving file to Storage:", filePath);
      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
      });

      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      console.log("✅ Upload successful! File URL:", fileUrl);

      // ✅ Store file details in Firestore for tracking
      await db.collection("uploads").doc(fileName).set({
        fileName: fileName,
        storagePath: filePath,
        url: fileUrl,
        contentType: req.file.mimetype,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({ message: "Upload successful!", url: fileUrl });
    } catch (error) {
      console.error("❌ Upload Error:", error);
      res.status(500).send("Error uploading file");
    }
  });
});

/** ✅ 4. Get Image URL from Firestore */
exports.getImageUrl = onRequest(async (req, res) => {
  console.log("🔍 Get Image URL function triggered");

  const { fileName } = req.query;

  if (!fileName) {
    console.log("❌ File name is missing in request");
    return res.status(400).send("File name is required");
  }

  try {
    // 🔎 Check Firestore if file exists
    const fileDoc = await db.collection("uploads").doc(fileName).get();

    if (!fileDoc.exists) {
      console.log("❌ File not found in Firestore");
      return res.status(404).send("File not found");
    }

    const filePath = fileDoc.data().storagePath;
    const file = admin.storage().bucket().file(filePath);
    console.log("📎 Generating signed URL for:", filePath);

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "2030-03-01",
    });

    console.log("✅ Signed URL generated:", url);
    res.status(200).json({ url });
  } catch (error) {
    console.error("❌ Error fetching file:", error);
    res.status(500).send("Error fetching file");
  }
});

/** ✅ 5. List All Uploaded Images */
exports.listUploads = onRequest(async (req, res) => {
  console.log("📋 Fetching list of uploaded images");

  try {
    const snapshot = await db.collection("uploads").orderBy("createdAt", "desc").get();
    const images = snapshot.docs.map((doc) => doc.data());

    console.log("✅ Retrieved", images.length, "images");
    res.status(200).json(images);
  } catch (error) {
    console.error("❌ Error fetching images:", error);
    res.status(500).send("Error fetching uploaded images");
  }
});
