## The architecture struggle

En este update voy a desarrollar sobre las decisiones que fui tomando en el diseño de la solución para mi Thumbnail Generator API.

Como mencioné en el update previo, decidí crear esta solución utilizando el CDK de AWS para crear mi infraestructura con Typescript de una manera flexible ya que esto me permite encapsular patrones y reutilizar código.

Al interiorizarme con el CDK y algunos de los servicios de AWS decidí hacer una solución basada en eventos para interiorizarme con EventBridge.  

Así cree [este primer diseño](https://excalidraw.com/#json=Gx6-8e-evQd-67kGsutgQ,b9L79iEA1mOFyfqfkoSkXw) 

[![Conceptual architecture diagram](https://i.imgur.com/cp3ULlO.png)](https://excalidraw.com/#json=ZAPnRTmNEZViQkVVofjw7,cgH9dK3tMScaqnN9rlF_Rw)

En este diseño mi `Stack` principal se divide en cuatro L3 constructs, que serían las abstracciones de más alto nivel de mi API, estos serían: `fileUploader`, `thumbnailGenerator`, `dataStorer` y `responseSender`. 

Estos construct se comunican mediante dos tipos de eventos o `rules`, aquí dejo un ejemplo de la estructura de cada uno de estos eventos:


- `imageUploaded` event:
``` json
{
  "detail-type": "imageUploaded",
  "source": "imageUploader",
  "detail": {
	"fileUrl": "https://s3.amazonaws.com/my-bucket/my-file.jpg",
	"metadata": {
	    "fileSize": 999,
	    "type": "image/jpeg",
		  "filename": "uuid",
	    }
    }
}
```


- `thumbnailsGenerated` event:
```json
{
  "detail-type": "thumbnailsGenerated",
  "source": "thumbnailGenerator",
  "detail": {
	"originalUrl": "https://s3.amazonaws.com/my-bucket/my-file.jpg",
	"thumbnails": [
	{
		"size": {
			"width": 120,
			"height": 120
		},
		"url": "https://s3.amazonaws.com/my-bucket/my-file-small.jpg"
	},
	{
		"size": {
			"width": 160,
			"height": 120
		},
		"url": "https://s3.amazonaws.com/my-bucket/my-file-medium.jpg"
	},
	{
		"size": {
			"width": 400,
			"height": 300
		},
		"url": "https://s3.amazonaws.com/my-bucket/my-file-large.jpg"
	}
	],
	"metadata": {
	    "fileSize": 999,
	    "type": "image/jpeg",
		  "filename": "uuid",
		}
	}
}
```


Una vez hecho esto pensé que podría aprovechar la flexibilidad que me proveían los constructs del CDK y pensando que podría tratarse de una tarea pesada, tuve la idea de procesar los resizes en tres instancias del mismo construct `imageResizer` paralelamente en 3 lambdas.

Así surgió [este diseño más complejo ](https://excalidraw.com/#json=aZ7nDUGtJAJ6706A3twzl,5nF0C7nNSpomzEBsES8EiA)

[![Complete architecture diagram](https://i.imgur.com/dLykJGw.png)](https://excalidraw.com/#json=ZAPnRTmNEZViQkVVofjw7,cgH9dK3tMScaqnN9rlF_Rw)


Así comencé la implementación, creé la estructura principal de mi `Stack`, pude crear sin problemas mi `eventBus`, los eventos, pude crear y probar los primeros dos construct y comunicarlos sin problemas, luego implementé una `FIFO queue` de SQS para agrupar los 3 mensajes del batch por id y cree el aggregator para formatear los registros de la queue en un solo evento. El problema que surgió es que SQS no siempre envía el batch completo, a veces llega un solo registro o 2 o los 3 al aggregator de forma aleatoria. Me di cuenta de que podría usar un cliente SQS en el aggregator para que se quede 'escuchando' hasta completar el batch de 3 mensajes.

Pero también me di cuenta que estaba perdiendo mucho tiempo en esta parte de la implementación y debería priorizar completar el flujo para el MVP. Entonces empecé a pensar en [simplificar la arquitectura de esta manera](https://excalidraw.com/#json=FAmn0eq28dSiVcbdYF3YC,THoTbPR95kt8CSO_PgFflg) :

[![Simplified architecture diagram](https://i.imgur.com/ck6fFKi.png)](https://excalidraw.com/#json=FAmn0eq28dSiVcbdYF3YC,THoTbPR95kt8CSO_PgFflg)

Así que ya un poco excedido con los tiempos me encuentro completando los últimos dos construct para cerrar el flujo.


## Other thoughts

Otras barreras que encontré en mi arquitectura es el límite de payload the API Gateway, es de 10mb, si bien en los requirements se pide rechazar archivos mayores a 11mb, bueno, en este caso se cumple, incluso serán rechazados de 10mb en adelante. 

Para poder aceptar archivos entre 10mb y 11mb debería cambiarse la arquitectura, podría por ejemplo enviarse una presinged-URL para que el cliente acceda directamente a bucket para hacer el upload. Pero me pareció que un limite de 10mb era más que suficiente para la creación de thumbnails y la relación costo/beneficio de modificar la arquitectura para ese edge-use-case no valía la pena, tanto por el tiempo de desarrollo como por el costo en seguridad que implica exponer el bucket.

Un posible walkaround para estos casos podría ser realizar una compresión de los files desde el cliente ya que la calidad de imagen no es tan importante en thumbnails.


## Truly async

Hasta ahora mi arquitectura giraba al rededor de un solo endpoint, una sola request y una sola respuesta.

Pero ahora creo que esto puede ser contraproducente, ya sea por los cold starts o por el propio proceso de las imágenes, una request muy prolongada podría incurrir en un time-out.


### The WebHook approach

Entonces se me ocurrió que podría resolver esto con la ayuda de los `WebHooks`. Y encontré esta nota de Cloudinary que validó mi idea, habla sobre el uso de [WebHook notifications y background image processing](https://cloudinary.com/blog/webhooks_upload_notifications_and_background_image_processing).

Para esto el cliente además de enviar el file en el form, debería exponer un Endpoint en el cual escuchar la notificación webhook y enviar la URL de este Endpoint en la primer request. Esta URL de respuesta debería también agregarse a los eventos para que el último construct pueda enviar debidamente la respuesta a ese endpoint con una petición HTTP de tipo POST.

Algo así sería la comunicación entre el Cliente y la API:


[![WebHook communication diagram](https://i.imgur.com/NFpUC3q.png)](https://excalidraw.com/#json=uqTiqXaWeiLNtzPZzcpOm,lABnDe5TZCmLXP3TUInVeA)
